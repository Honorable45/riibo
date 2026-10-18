import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../uploads/media.service';
import { AdminUpdateItemDto, ListAdminItemsQueryDto } from './dto/admin-ops.dto';

const DEFAULT_PAGE_SIZE = 30;

const ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  imageUrl: true,
  isAvailable: true,
  stock: true,
  maxQuantity: true,
  rating: true,
  reviewCount: true,
  createdAt: true,
  updatedAt: true,
  restaurant: { select: { id: true, name: true, status: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { optionGroups: true } },
} satisfies Prisma.MenuItemSelect;

type ItemRow = Prisma.MenuItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** Défauts de fiche visibles d'un coup d'œil dans le backoffice. */
function issuesOf(item: ItemRow): string[] {
  const issues: string[] = [];
  if (!item.imageUrl) issues.push('NO_IMAGE');
  if (!item.description?.trim()) issues.push('NO_DESCRIPTION');
  if (!item.category) issues.push('NO_CATEGORY');
  if (!item.isAvailable) issues.push('UNAVAILABLE');
  if (item.stock === 0) issues.push('SOLD_OUT');
  if (item.price <= 0) issues.push('INVALID_PRICE');
  return issues;
}

function toDto({ _count, ...item }: ItemRow) {
  return { ...item, optionGroupCount: _count.optionGroups, issues: issuesOf({ ...item, _count }) };
}

/**
 * Supervision des menus. L'admin ne modifie ni prix ni contenu (c'est le
 * métier du restaurant) : il peut retirer un plat de la vente et gérer son
 * image, toujours avec trace dans le journal d'audit.
 */
@Injectable()
export class AdminMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAdminItemsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const and: Prisma.MenuItemWhereInput[] = [{ deletedAt: null }];
    if (query.restaurantId) and.push({ restaurantId: query.restaurantId });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.available !== undefined) and.push({ isAvailable: query.available });
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { restaurant: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    switch (query.issue) {
      case 'NO_IMAGE':
        and.push({ OR: [{ imageUrl: null }, { imageUrl: '' }] });
        break;
      case 'NO_DESCRIPTION':
        and.push({ OR: [{ description: null }, { description: '' }] });
        break;
      case 'NO_CATEGORY':
        and.push({ categoryId: null });
        break;
      case 'UNAVAILABLE':
        and.push({ isAvailable: false });
        break;
      case 'SOLD_OUT':
        and.push({ stock: 0 });
        break;
    }
    const where: Prisma.MenuItemWhereInput = { AND: and };
    const [rows, summary] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        orderBy: [{ restaurant: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: ITEM_SELECT,
      }),
      this.summary(query.restaurantId),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(toDto),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      summary,
    };
  }

  async getOne(itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: {
        ...ITEM_SELECT,
        optionGroups: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            minSelect: true,
            maxSelect: true,
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, name: true, priceDelta: true, isAvailable: true },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Plat introuvable.');
    const { optionGroups, ...rest } = item;
    return { ...toDto(rest), optionGroups };
  }

  /** Menu complet d'un restaurant, tel que le restaurant le gère. */
  async restaurantMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');
    const [categories, items] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { restaurantId },
        orderBy: { position: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.menuItem.findMany({
        where: { restaurantId, deletedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: ITEM_SELECT,
      }),
    ]);
    const dtos = items.map(toDto);
    return {
      categories: categories.map((c) => ({ ...c, items: dtos.filter((i) => i.category?.id === c.id) })),
      uncategorized: dtos.filter((i) => !i.category),
    };
  }

  async setAvailability(adminId: string, itemId: string, dto: AdminUpdateItemDto, ipAddress?: string) {
    const item = await this.requireItem(itemId);
    await this.prisma.menuItem.update({ where: { id: itemId }, data: { isAvailable: dto.isAvailable } });
    await this.audit.log({
      actorId: adminId,
      action: dto.isAvailable ? 'MENU_ITEM_ENABLED_BY_ADMIN' : 'MENU_ITEM_DISABLED_BY_ADMIN',
      targetType: 'MENU_ITEM',
      targetId: itemId,
      metadata: { restaurantId: item.restaurantId, before: item.isAvailable, after: dto.isAvailable, reason: dto.reason },
      ipAddress,
    });
    return this.getOne(itemId);
  }

  async setImage(adminId: string, itemId: string, file: Express.Multer.File | undefined, ipAddress?: string) {
    const item = await this.requireItem(itemId);
    const imageUrl = await this.media.savePublicImage(file, 'menu');
    await this.prisma.menuItem.update({ where: { id: itemId }, data: { imageUrl } });
    await this.deleteIfUnused(item.imageUrl);
    await this.audit.log({
      actorId: adminId,
      action: item.imageUrl ? 'MENU_ITEM_IMAGE_REPLACED_BY_ADMIN' : 'MENU_ITEM_IMAGE_ADDED_BY_ADMIN',
      targetType: 'MENU_ITEM',
      targetId: itemId,
      metadata: { restaurantId: item.restaurantId, before: item.imageUrl, after: imageUrl },
      ipAddress,
    });
    return this.getOne(itemId);
  }

  async removeImage(adminId: string, itemId: string, ipAddress?: string) {
    const item = await this.requireItem(itemId);
    if (!item.imageUrl) return this.getOne(itemId);
    await this.prisma.menuItem.update({ where: { id: itemId }, data: { imageUrl: null } });
    await this.deleteIfUnused(item.imageUrl);
    await this.audit.log({
      actorId: adminId,
      action: 'MENU_ITEM_IMAGE_REMOVED_BY_ADMIN',
      targetType: 'MENU_ITEM',
      targetId: itemId,
      metadata: { restaurantId: item.restaurantId, before: item.imageUrl },
      ipAddress,
    });
    return this.getOne(itemId);
  }

  /** Le fichier n'est supprimé que si plus aucun plat ni restaurant ne l'utilise. */
  private async deleteIfUnused(url: string | null) {
    if (!url) return;
    const [items, restaurants] = await Promise.all([
      this.prisma.menuItem.count({ where: { imageUrl: url } }),
      this.prisma.restaurant.count({ where: { OR: [{ logoUrl: url }, { coverUrl: url }] } }),
    ]);
    if (items + restaurants === 0) await this.media.deleteByUrl(url);
  }

  private async requireItem(itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true, restaurantId: true, imageUrl: true, isAvailable: true },
    });
    if (!item) throw new NotFoundException('Plat introuvable.');
    return item;
  }

  private async summary(restaurantId?: string) {
    const base: Prisma.MenuItemWhereInput = { deletedAt: null, ...(restaurantId ? { restaurantId } : {}) };
    const [total, noImage, unavailable, noDescription, soldOut] = await Promise.all([
      this.prisma.menuItem.count({ where: base }),
      this.prisma.menuItem.count({ where: { ...base, OR: [{ imageUrl: null }, { imageUrl: '' }] } }),
      this.prisma.menuItem.count({ where: { ...base, isAvailable: false } }),
      this.prisma.menuItem.count({ where: { ...base, OR: [{ description: null }, { description: '' }] } }),
      this.prisma.menuItem.count({ where: { ...base, stock: 0 } }),
    ]);
    return { total, noImage, unavailable, noDescription, soldOut };
  }
}
