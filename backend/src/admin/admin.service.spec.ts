import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { MessagesService } from '../messages/messages.service';
import { ReviewsService } from '../reviews/reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let prisma: {
    user: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    message: { count: jest.Mock; findUnique: jest.Mock };
    call: { count: jest.Mock };
    report: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let messages: { removeAsAdmin: jest.Mock };
  let reviews: { setHidden: jest.Mock };
  let audit: { log: jest.Mock };
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      message: { count: jest.fn(), findUnique: jest.fn() },
      call: { count: jest.fn() },
      report: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    messages = { removeAsAdmin: jest.fn().mockResolvedValue(undefined) };
    reviews = { setHidden: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AdminService(
      prisma as unknown as PrismaService,
      messages as unknown as MessagesService,
      reviews as unknown as ReviewsService,
      audit as unknown as AuditService,
    );
  });

  describe('getMetrics', () => {
    it('agrège les comptes de chaque ressource', async () => {
      prisma.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(90);
      prisma.message.count.mockResolvedValueOnce(500).mockResolvedValueOnce(42);
      prisma.call.count.mockResolvedValue(12);
      prisma.report.count.mockResolvedValue(3);

      const metrics = await service.getMetrics();

      expect(metrics).toEqual({
        users: { total: 100, active: 90 },
        messagesSent: { total: 500, last7Days: 42 },
        calls: { total: 12 },
                reports: { pending: 3 },
      });
    });
  });

  describe('listUsers', () => {
    it('cherche par nom, téléphone, e-mail ou nom d’utilisateur, et filtre par rôle', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listUsers({ q: 'ali', role: 'CLIENT' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { role: 'CLIENT' },
              {
                OR: [
                  { username: { contains: 'ali', mode: 'insensitive' } },
                  { email: { contains: 'ali', mode: 'insensitive' } },
                  { firstName: { contains: 'ali', mode: 'insensitive' } },
                  { lastName: { contains: 'ali', mode: 'insensitive' } },
                  { phone: { contains: 'ali' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('pagine par curseur (hasMore/nextCursor)', async () => {
      const rows = Array.from({ length: 31 }, (_, i) => ({ id: `user-${i}` }));
      prisma.user.findMany.mockResolvedValue(rows);
      const result = await service.listUsers({});
      expect(result.items).toHaveLength(30);
      expect(result.nextCursor).toBe('user-29');
    });
  });

  describe('updateUserStatus', () => {
    const suspend = { isActive: false, reason: 'Fraude répétée' };

    it('refuse un utilisateur introuvable', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateUserStatus('admin-1', 'nope', suspend)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('suspend un compte avec motif et le journalise', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'CLIENT', isActive: true });
      prisma.user.update.mockResolvedValue({ id: 'user-1', isActive: false });
      const result = await service.updateUserStatus('admin-1', 'user-1', suspend, '1.2.3.4');
      expect(result.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' }, data: { isActive: false } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          action: 'USER_SUSPENDED',
          targetId: 'user-1',
          metadata: { role: 'CLIENT', reason: 'Fraude répétée' },
        }),
      );
    });

    it('exige un motif pour suspendre', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'CLIENT', isActive: true });
      await expect(service.updateUserStatus('admin-1', 'user-1', { isActive: false })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('interdit de se suspendre soi-même ou un autre admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', isActive: true });
      await expect(service.updateUserStatus('admin-1', 'admin-1', suspend)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-2', role: 'ADMIN', isActive: true });
      await expect(service.updateUserStatus('admin-1', 'admin-2', suspend)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('resolveReport', () => {
    it('refuse un signalement déjà traité', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' });
      await expect(
        service.resolveReport('admin-1', 'report-1', { action: 'DISMISS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse un signalement introuvable', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await expect(
        service.resolveReport('admin-1', 'nope', { action: 'DISMISS' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('DISMISS ne supprime jamais le contenu, seulement le statut du signalement', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'report-1',
        status: 'PENDING',
        targetType: 'MESSAGE',
        targetId: 'msg-1',
      });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'DISMISSED' });

      await service.resolveReport('admin-1', 'report-1', { action: 'DISMISS' });

      expect(messages.removeAsAdmin).not.toHaveBeenCalled();
      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'DISMISSED', resolvedById: 'admin-1' }),
        }),
      );
    });

    it('REMOVE_CONTENT sur un signalement MESSAGE appelle MessagesService.removeAsAdmin', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'report-1',
        status: 'PENDING',
        targetType: 'MESSAGE',
        targetId: 'msg-1',
      });
      prisma.report.update.mockResolvedValue({ id: 'report-1', status: 'RESOLVED' });

      await service.resolveReport('admin-1', 'report-1', { action: 'REMOVE_CONTENT' });

      expect(messages.removeAsAdmin).toHaveBeenCalledWith('msg-1');
      expect(prisma.report.update).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) }),
      );
    });

    it('REMOVE_CONTENT sur un signalement REVIEW masque l\'avis (et recalcule les notes)', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'report-2', status: 'PENDING', targetType: 'REVIEW', targetId: 'rev-1' });
      prisma.report.update.mockResolvedValue({ id: 'report-2', status: 'RESOLVED' });

      await service.resolveReport('admin-1', 'report-2', { action: 'REMOVE_CONTENT' });

      expect(reviews.setHidden).toHaveBeenCalledWith('rev-1', true);
    });

    it("REMOVE_CONTENT refuse pour un signalement USER — on désactive le compte, on ne 'supprime' pas un utilisateur", async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'report-1',
        status: 'PENDING',
        targetType: 'USER',
        targetId: 'user-9',
      });

      await expect(
        service.resolveReport('admin-1', 'report-1', { action: 'REMOVE_CONTENT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.report.update).not.toHaveBeenCalled();
    });
  });
});
