import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeOpenStatus } from '../restaurants/restaurant-hours.util';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../uploads/media.service';
import {
  CreateMenuCategoryDto,
  CreateMenuItemDto,
  SetOptionGroupsDto,
  UpdateMenuCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';
import { ListMenuItemsQueryDto } from './dto/list-menu-items-query.dto';

const ITEM_INCLUDE = {
  optionGroups: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.MenuItemInclude;

type ItemWithOptions = Prisma.MenuItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function toItemDto(item: ItemWithOptions) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    price: item.price,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    maxQuantity: item.maxQuantity,
    // Le stock exact n'est jamais exposé au client : seulement « épuisé ».
    optionGroups: item.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
        isAvailable: option.isAvailable,
      })),
    })),
  };
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  /** Menu public d'un restaurant approuvé (par id ou slug). */
  async getPublicMenu(idOrSlug: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { status: 'APPROVED', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');
    return this.buildMenu(restaurant.id);
  }

  /**
   * Catalogue public de plats tous restaurants confondus (accueil client) : seulement
   * les plats vendables maintenant (disponibles, en stock, restaurant approuvé).
   */
  async listPublicItems(query: ListMenuItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = query.q?.trim();

    const where: Prisma.MenuItemWhereInput = {
      isAvailable: true,
      deletedAt: null,
      restaurant: {
        status: 'APPROVED',
        ...(query.category ? { categories: { some: { slug: query.category } } } : {}),
      },
      AND: [
        // stock null = illimité (toujours vendable) ; seul stock = 0 exclut le plat.
        { OR: [{ stock: null }, { stock: { gt: 0 } }] },
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { restaurant: { name: { contains: q, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.menuItem.count({ where }),
      this.prisma.menuItem.findMany({
        where,
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          rating: true,
          reviewCount: true,
          optionGroups: { select: { id: true }, take: 1 },
          restaurant: {
            select: {
              id: true,
              slug: true,
              name: true,
              isPaused: true,
              hours: true,
              closures: { where: { endsAt: { gt: new Date() } } },
            },
          },
        },
        // Les plats les plus commentés d'abord (accueil « Plats populaires »), puis les plus récents.
        orderBy: [{ reviewCount: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const now = new Date();
    const items = rows.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
      rating: item.rating,
      reviewCount: item.reviewCount,
      hasOptions: item.optionGroups.length > 0,
      restaurant: {
        id: item.restaurant.id,
        slug: item.restaurant.slug,
        name: item.restaurant.name,
        isOpen: computeOpenStatus(
          { isPaused: item.restaurant.isPaused, hours: item.restaurant.hours, closures: item.restaurant.closures },
          now,
        ).isOpen,
      },
    }));

    return { items, page, limit, total, hasMore: page * limit < total };
  }

  /** Menu complet vu par le restaurant lui-même (y compris plats indisponibles, stock exact). */
  async getOwnerMenu(restaurantId: string) {
    const menu = await this.buildMenu(restaurantId);
    const stocks = await this.prisma.menuItem.findMany({
      where: { restaurantId, deletedAt: null },
      select: { id: true, stock: true },
    });
    const stockById = new Map(stocks.map((item) => [item.id, item.stock]));
    const withStock = <T extends { id: string }>(item: T) => ({
      ...item,
      stock: stockById.get(item.id) ?? null,
    });
    return {
      categories: menu.categories.map((category) => ({
        ...category,
        items: category.items.map(withStock),
      })),
      uncategorized: menu.uncategorized.map(withStock),
    };
  }

  private async buildMenu(restaurantId: string) {
    const [categories, items] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { restaurantId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.menuItem.findMany({
        where: { restaurantId, deletedAt: null },
        include: ITEM_INCLUDE,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const dtos = items.map((item) => ({
      // Un plat dont le stock est à 0 est présenté comme indisponible.
      ...toItemDto(item),
      isAvailable: item.isAvailable && (item.stock === null || item.stock > 0),
    }));

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: dtos.filter((item) => item.categoryId === category.id),
      })),
      uncategorized: dtos.filter((item) => item.categoryId === null),
    };
  }

  // ---------------------------------------------------------------------------
  // Catégories
  // ---------------------------------------------------------------------------

  async createCategory(restaurantId: string, dto: CreateMenuCategoryDto) {
    const count = await this.prisma.menuCategory.count({ where: { restaurantId } });
    if (count >= 40) throw new BadRequestException('Trop de catégories (40 maximum).');
    return this.prisma.menuCategory.create({
      data: { restaurantId, name: dto.name.trim(), position: dto.position ?? count },
      select: { id: true, name: true, position: true },
    });
  }

  async updateCategory(restaurantId: string, categoryId: string, dto: UpdateMenuCategoryDto) {
    await this.requireCategory(restaurantId, categoryId);
    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { name: dto.name?.trim(), position: dto.position },
      select: { id: true, name: true, position: true },
    });
  }

  /** Les plats de la catégorie ne sont pas supprimés : ils deviennent « sans catégorie ». */
  async deleteCategory(restaurantId: string, categoryId: string): Promise<void> {
    await this.requireCategory(restaurantId, categoryId);
    await this.prisma.menuCategory.delete({ where: { id: categoryId } });
  }

  // ---------------------------------------------------------------------------
  // Plats
  // ---------------------------------------------------------------------------

  async createItem(restaurantId: string, dto: CreateMenuItemDto) {
    if (dto.categoryId) await this.requireCategory(restaurantId, dto.categoryId);
    const count = await this.prisma.menuItem.count({ where: { restaurantId, deletedAt: null } });
    if (count >= 300) throw new BadRequestException('Trop de plats (300 maximum).');

    const item = await this.prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        price: dto.price,
        isAvailable: dto.isAvailable ?? true,
        stock: dto.stock ?? null,
        maxQuantity: dto.maxQuantity ?? null,
        position: dto.position ?? count,
      },
      include: ITEM_INCLUDE,
    });
    return toItemDto(item);
  }

  async updateItem(restaurantId: string, itemId: string, dto: UpdateMenuItemDto) {
    await this.requireItem(restaurantId, itemId);
    if (dto.categoryId) await this.requireCategory(restaurantId, dto.categoryId);

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        price: dto.price,
        categoryId: dto.categoryId,
        isAvailable: dto.isAvailable,
        stock: dto.stock,
        maxQuantity: dto.maxQuantity,
        position: dto.position,
      },
      include: ITEM_INCLUDE,
    });
    return toItemDto(item);
  }

  /** Suppression logique : les commandes passées gardent leur snapshot. */
  async deleteItem(restaurantId: string, itemId: string): Promise<void> {
    const item = await this.requireItem(restaurantId, itemId);
    await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date(), isAvailable: false },
    });
    await this.media.deleteByUrl(item.imageUrl);
  }

  async setItemImage(restaurantId: string, itemId: string, file: Express.Multer.File | undefined) {
    const item = await this.requireItem(restaurantId, itemId);
    const imageUrl = await this.media.savePublicImage(file, 'menu');
    await this.prisma.menuItem.update({ where: { id: itemId }, data: { imageUrl } });
    await this.media.deleteByUrl(item.imageUrl);
    return { imageUrl };
  }

  /**
   * Remplace tous les groupes d'options d'un plat en une transaction. Règles :
   * min ≤ max, et un groupe obligatoire (min ≥ 1) doit pouvoir être satisfait
   * (au moins `min` options disponibles).
   */
  async setOptionGroups(restaurantId: string, itemId: string, dto: SetOptionGroupsDto) {
    await this.requireItem(restaurantId, itemId);

    for (const group of dto.groups) {
      if (group.minSelect > group.maxSelect) {
        throw new BadRequestException(
          `« ${group.name} » : le minimum de choix dépasse le maximum.`,
        );
      }
      const available = group.options.filter((option) => option.isAvailable !== false).length;
      if (group.minSelect > available) {
        throw new BadRequestException(
          `« ${group.name} » : pas assez d'options pour un minimum de ${group.minSelect}.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.menuItemOptionGroup.deleteMany({ where: { menuItemId: itemId } });
      for (const [groupPosition, group] of dto.groups.entries()) {
        await tx.menuItemOptionGroup.create({
          data: {
            menuItemId: itemId,
            name: group.name.trim(),
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            position: groupPosition,
            options: {
              create: group.options.map((option, position) => ({
                name: option.name.trim(),
                priceDelta: option.priceDelta ?? 0,
                isAvailable: option.isAvailable ?? true,
                position,
              })),
            },
          },
        });
      }
    });

    const item = await this.prisma.menuItem.findUniqueOrThrow({
      where: { id: itemId },
      include: ITEM_INCLUDE,
    });
    return toItemDto(item);
  }

  // ---------------------------------------------------------------------------

  /** 404 si la catégorie n'appartient pas à CE restaurant : jamais d'accès inter-restaurants par id deviné. */
  private async requireCategory(restaurantId: string, categoryId: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });
    if (!category) throw new NotFoundException('Catégorie introuvable.');
    return category;
  }

  private async requireItem(restaurantId: string, itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Plat introuvable.');
    return item;
  }
}
