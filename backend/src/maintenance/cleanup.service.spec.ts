import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../uploads/storage.service';
import { CleanupService } from './cleanup.service';

describe('CleanupService', () => {
  let prisma: {
    userSession: { deleteMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    conversation: { updateMany: jest.Mock };
  };
  let storage: { delete: jest.Mock };
  let service: CleanupService;

  beforeEach(() => {
    prisma = {
      userSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    service = new CleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );
  });

  describe('cleanupExpiredSessions', () => {
    it('supprime uniquement les sessions dont expiresAt est passé', async () => {
      prisma.userSession.deleteMany.mockResolvedValue({ count: 3 });

      await service.cleanupExpiredSessions();

      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('ne plante jamais si la base est indisponible', async () => {
      prisma.userSession.deleteMany.mockRejectedValue(new Error('DatabaseNotReachable'));

      await expect(service.cleanupExpiredSessions()).resolves.toBeUndefined();
    });
  });

  describe('cleanupExpiredPasswordResetTokens', () => {
    it('ne plante jamais si la base est indisponible', async () => {
      prisma.passwordResetToken.deleteMany.mockRejectedValue(new Error('panne'));

      await expect(service.cleanupExpiredPasswordResetTokens()).resolves.toBeUndefined();
    });
  });

  describe('closeFinishedOrderConversations', () => {
    it('ferme uniquement les conversations de commandes terminées depuis plus de 24 h', async () => {
      prisma.conversation.updateMany.mockResolvedValue({ count: 2 });
      const before = Date.now();

      await service.closeFinishedOrderConversations();

      expect(prisma.conversation.updateMany).toHaveBeenCalledTimes(1);
      const args = prisma.conversation.updateMany.mock.calls[0][0] as {
        where: {
          closedAt: null;
          orderId: { not: null };
          order: { status: { in: string[] }; updatedAt: { lt: Date } };
        };
      };
      expect(args.where.closedAt).toBeNull();
      expect(args.where.orderId).toEqual({ not: null });
      expect(args.where.order.status.in).toEqual(['DELIVERED', 'CANCELLED', 'REJECTED']);
      // Seuil : maintenant − 24 h (à quelques secondes près).
      const cutoff = args.where.order.updatedAt.lt.getTime();
      expect(before - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5_000);
    });

    it('ne plante jamais si la base est indisponible', async () => {
      prisma.conversation.updateMany.mockRejectedValue(new Error('panne'));

      await expect(service.closeFinishedOrderConversations()).resolves.toBeUndefined();
    });
  });
});
