import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushProvider } from './push.provider';
import { PushService } from './push.service';

describe('PushService', () => {
  let prisma: {
    pushSubscription: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let push: { getPublicKey: jest.Mock };
  let service: PushService;

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };
    push = { getPublicKey: jest.fn() };
    service = new PushService(prisma as unknown as PrismaService, push as unknown as PushProvider);
  });

  describe('getPublicKey', () => {
    it('échoue explicitement si les notifications push ne sont pas configurées', () => {
      push.getPublicKey.mockReturnValue(null);
      expect(() => service.getPublicKey()).toThrow(ServiceUnavailableException);
    });

    it('renvoie la clé publique quand configurée', () => {
      push.getPublicKey.mockReturnValue('pub-key');
      expect(service.getPublicKey()).toEqual({ publicKey: 'pub-key' });
    });
  });

  describe('subscribe', () => {
    it("retire les plus anciens abonnements au-delà de 10 par utilisateur", async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

      await service.subscribe(
        'user-1',
        'session-1',
        { endpoint: 'https://push.example.com/a', keys: { p256dh: 'p', auth: 'a' } },
        null,
      );

      expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, skip: 10 }),
      );
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2'] } },
      });
    });

    it("fait un upsert par endpoint avec l'agent utilisateur fourni", async () => {
      await service.subscribe(
        'user-1',
        'session-1',
        { endpoint: 'https://push.example.com/a', keys: { p256dh: 'p', auth: 'a' } },
        'Mozilla/5.0',
      );

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/a' },
        create: {
          userId: 'user-1',
          sessionId: 'session-1',
          endpoint: 'https://push.example.com/a',
          p256dh: 'p',
          auth: 'a',
          userAgent: 'Mozilla/5.0',
        },
        update: { userId: 'user-1', sessionId: 'session-1', p256dh: 'p', auth: 'a', userAgent: 'Mozilla/5.0' },
      });
    });
  });

  describe('unsubscribe', () => {
    it("refuse (404) si l'abonnement n'existe pas", async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue(null);

      await expect(
        service.unsubscribe('user-1', 'https://push.example.com/a'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
    });

    it("refuse (404, jamais 403) si l'abonnement appartient à un autre utilisateur", async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue({
        endpoint: 'https://push.example.com/a',
        userId: 'user-2',
      });

      await expect(
        service.unsubscribe('user-1', 'https://push.example.com/a'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
    });

    it("supprime l'abonnement quand il appartient bien à l'appelant", async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue({
        endpoint: 'https://push.example.com/a',
        userId: 'user-1',
      });

      await service.unsubscribe('user-1', 'https://push.example.com/a');

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/a' },
      });
    });
  });
});
