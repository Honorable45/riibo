import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MessagesService } from '../messages/messages.service';
import { ReviewsService } from '../reviews/reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { AdminUserStatusDto, ListAdminUsersQueryDto } from './dto/admin-ops.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';

const DEFAULT_PAGE_SIZE = 30;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminMetrics {
  users: { total: number; active: number };
  messagesSent: { total: number; last7Days: number };
  calls: { total: number };
  reports: { pending: number };
}

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export interface AdminOverview {
  date: string;
  orders: { today: number; delivered: number; inProgress: number; cancelled: number; total: number };
  revenueToday: number;
  last7Days: Array<{ date: string; orders: number }>;
  restaurants: Record<string, number>;
  drivers: Record<string, number> & { online: number };
  clients: number;
}

const USER_SUMMARY = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Premiers `count()` agrégés de ce projet (jusqu'ici, jamais eu besoin
   * d'une vue d'ensemble — chaque endpoint existant renvoie des données
   * scopées à un utilisateur ou une conversation). Rien d'exotique : des
   * comptages Prisma standards, en parallèle.
   */
  async getMetrics(): Promise<AdminMetrics> {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    const [
      usersTotal,
      usersActive,
      messagesTotal,
      messagesLast7Days,
      callsTotal,
      reportsPending,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.call.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      users: { total: usersTotal, active: usersActive },
      messagesSent: { total: messagesTotal, last7Days: messagesLast7Days },
      calls: { total: callsTotal },
      reports: { pending: reportsPending },
    };
  }

  /** Vue d'ensemble « livraison » du backoffice : commandes du jour, chiffre d'affaires, dossiers par statut. */
  async getOverview(): Promise<AdminOverview> {
    const now = new Date();
    // Africa/Lome = UTC+0 : minuit UTC est bien le début de la journée locale.
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekStart = new Date(since.getTime() - 6 * 24 * 60 * 60 * 1000);
    const [today, ordersTotal, revenue, weekOrders, restaurants, drivers, driversOnline, clients] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        where: { status: 'DELIVERED', createdAt: { gte: since } },
        _sum: { subtotal: true, discountAmount: true },
      }),
      this.prisma.order.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
      this.prisma.restaurant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.driverProfile.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.driverProfile.count({ where: { isOnline: true } }),
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
    ]);

    const count = (...statuses: string[]) =>
      today.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      return { date: key, orders: weekOrders.filter((o) => o.createdAt.toISOString().slice(0, 10) === key).length };
    });
    const byStatus = (rows: Array<{ status: string; _count: { _all: number } }>) =>
      Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

    return {
      date: since.toISOString().slice(0, 10),
      orders: {
        today: today.reduce((sum, row) => sum + row._count._all, 0),
        delivered: count('DELIVERED'),
        inProgress: count('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'),
        cancelled: count('CANCELLED', 'REJECTED'),
        total: ordersTotal,
      },
      revenueToday: (revenue._sum.subtotal ?? 0) - (revenue._sum.discountAmount ?? 0),
      last7Days: days,
      restaurants: byStatus(restaurants),
      drivers: { ...byStatus(drivers), online: driversOnline },
      clients,
    };
  }

  async listUsers(
    query: ListAdminUsersQueryDto,
  ): Promise<{ items: AdminUserSummary[]; nextCursor: string | null }> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const and: Prisma.UserWhereInput[] = [];
    if (query.role) and.push({ role: query.role });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q.replace(/\s/g, '') } },
        ],
      });
    }

    const rows = await this.prisma.user.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: USER_SUMMARY,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /**
   * Suspension / réactivation d'un compte. Une session d'un compte désactivé
   * est refusée à la requête suivante (session-validation.util.ts). Un admin
   * ne peut ni se suspendre lui-même ni suspendre un autre admin (pas de
   * hiérarchie d'admins en base : on évite qu'un compte compromis verrouille
   * l'équipe). Toujours journalisé.
   */
  async updateUserStatus(
    adminId: string,
    userId: string,
    dto: AdminUserStatusDto,
    ipAddress?: string,
  ): Promise<AdminUserSummary> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!existing) throw new NotFoundException('Utilisateur introuvable.');
    if (!dto.isActive) {
      if (userId === adminId) throw new ForbiddenException('Vous ne pouvez pas suspendre votre propre compte.');
      if (existing.role === 'ADMIN') throw new ForbiddenException('Un administrateur ne peut pas en suspendre un autre.');
      if (!dto.reason?.trim()) throw new BadRequestException('Un motif est obligatoire pour une suspension.');
    }
    if (existing.isActive === dto.isActive) {
      throw new ConflictException(dto.isActive ? 'Ce compte est déjà actif.' : 'Ce compte est déjà suspendu.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: USER_SUMMARY,
    });
    await this.audit.log({
      actorId: adminId,
      action: dto.isActive ? 'USER_REACTIVATED' : 'USER_SUSPENDED',
      targetType: 'USER',
      targetId: userId,
      metadata: { role: existing.role, reason: dto.reason?.trim() ?? null },
      ipAddress,
    });
    return updated;
  }

  async listReports(query: ListReportsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.report.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        reporter: { select: { id: true, username: true, firstName: true, lastName: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = await Promise.all(page.map((report) => this.withTargetPreview(report)));

    return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async resolveReport(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.status !== 'PENDING') {
      throw new BadRequestException('Ce signalement a déjà été traité.');
    }

    if (dto.action === 'REMOVE_CONTENT') {
      if (report.targetType === 'MESSAGE') {
        await this.messages.removeAsAdmin(report.targetId);
      } else if (report.targetType === 'REVIEW') {
        await this.reviews.setHidden(report.targetId, true);
      } else {
        throw new BadRequestException(
          'Suppression impossible pour ce type de cible — utilisez les actions dédiées (suspension, masquage d\'avis).',
        );
      }
    }

    const resolved = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.action === 'REMOVE_CONTENT' ? 'RESOLVED' : 'DISMISSED',
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
      include: {
        reporter: { select: { id: true, username: true, firstName: true, lastName: true } },
      },
    });
    await this.audit.log({
      actorId: adminId,
      action: dto.action === 'REMOVE_CONTENT' ? 'REPORT_CONTENT_REMOVED' : 'REPORT_DISMISSED',
      targetType: 'REPORT',
      targetId: reportId,
      metadata: { targetType: report.targetType, targetId: report.targetId },
    });
    return resolved;
  }

  /** Aperçu au moment de la consultation — `null` si la cible a été supprimée entre-temps (voir Report, polymorphe par design). */
  private async withTargetPreview<T extends { targetType: string; targetId: string }>(
    report: T,
  ): Promise<T & { targetPreview: string | null }> {
    const targetPreview = await this.previewTarget(report.targetType, report.targetId);
    return { ...report, targetPreview };
  }

  private async previewTarget(targetType: string, targetId: string): Promise<string | null> {
    switch (targetType) {
      case 'MESSAGE':
        return (
          (await this.prisma.message.findUnique({ where: { id: targetId }, select: { text: true } }))
            ?.text ?? null
        );
      case 'REVIEW':
        return (
          (await this.prisma.review.findUnique({ where: { id: targetId }, select: { comment: true } }))
            ?.comment ?? null
        );
      case 'RESTAURANT':
        return (
          (await this.prisma.restaurant.findUnique({ where: { id: targetId }, select: { name: true } }))
            ?.name ?? null
        );
      case 'ORDER': {
        const order = await this.prisma.order.findUnique({
          where: { id: targetId },
          select: { orderNumber: true },
        });
        return order ? `Commande #${order.orderNumber}` : null;
      }
      default:
        return (
          (await this.prisma.user.findUnique({ where: { id: targetId }, select: { username: true } }))
            ?.username ?? null
        );
    }
  }
}
