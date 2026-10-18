import type { Profile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { PresenceService } from './presence.service';

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    avatarUrl: null,
    avatarStorageKey: null,
    avatarStorageProvider: 'LOCAL',
    showLastSeen: true,
    showOnlineStatus: true,
    showReadReceipts: true,
    notificationsEnabled: true,
    hideNotificationContent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PresenceService', () => {
  let prisma: {
    profile: { findUnique: jest.Mock };
    user: { update: jest.Mock; findUnique: jest.Mock };
    conversationMember: { findMany: jest.Mock };
  };
  let events: { emitToUsers: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    prisma = {
      profile: { findUnique: jest.fn().mockResolvedValue(buildProfile()) },
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ lastSeenAt: null }),
      },
      conversationMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    events = { emitToUsers: jest.fn() };
    // Sans client Redis : le service retombe sur le store mémoire (dev/test).
    service = new PresenceService(
      prisma as unknown as PrismaService,
      { client: null } as unknown as RedisService,
      events as unknown as EventsGateway,
    );
  });

  it('marque en ligne à la première connexion et le reflète dans isOnline', async () => {
    expect(await service.isOnline('user-1')).toBe(false);
    await service.handleSocketConnected('user-1', 'socket-a');
    expect(await service.isOnline('user-1')).toBe(true);
  });

  it('ne rediffuse pas "en ligne" pour un deuxième appareil déjà connecté', async () => {
    prisma.conversationMember.findMany.mockResolvedValue([{ conversationId: 'conv-1' }]);
    await service.handleSocketConnected('user-1', 'socket-a');
    events.emitToUsers.mockClear();

    await service.handleSocketConnected('user-1', 'socket-b');

    expect(events.emitToUsers).not.toHaveBeenCalled();
    expect(await service.isOnline('user-1')).toBe(true);
  });

  it("reste en ligne tant qu'un autre appareil est connecté après une déconnexion", async () => {
    await service.handleSocketConnected('user-1', 'socket-a');
    await service.handleSocketConnected('user-1', 'socket-b');

    await service.handleSocketDisconnected('user-1', 'socket-a');

    expect(await service.isOnline('user-1')).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('passe hors ligne et horodate lastSeenAt à la dernière déconnexion', async () => {
    await service.handleSocketConnected('user-1', 'socket-a');

    await service.handleSocketDisconnected('user-1', 'socket-a');

    expect(await service.isOnline('user-1')).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  describe('getPresence', () => {
    it('masque isOnline/lastSeenAt selon les réglages de confidentialité par défaut', async () => {
      prisma.profile.findUnique.mockResolvedValue(
        buildProfile({ showOnlineStatus: false, showLastSeen: false }),
      );
      prisma.user.findUnique.mockResolvedValue({ lastSeenAt: new Date() });
      await service.handleSocketConnected('user-1', 'socket-a');

      const presence = await service.getPresence('user-1');

      expect(presence.isOnline).toBe(false);
      expect(presence.lastSeenAt).toBeNull();
    });

    it('ne masque jamais rien quand respectPrivacy=false (vue "moi-même")', async () => {
      prisma.profile.findUnique.mockResolvedValue(
        buildProfile({ showOnlineStatus: false, showLastSeen: false }),
      );
      const lastSeen = new Date();
      prisma.user.findUnique.mockResolvedValue({ lastSeenAt: lastSeen });
      await service.handleSocketConnected('user-1', 'socket-a');

      const presence = await service.getPresence('user-1', false);

      expect(presence.isOnline).toBe(true);
      expect(presence.lastSeenAt).toEqual(lastSeen);
    });
  });

  it("n'échoue jamais (ni ne plante) si la base est indisponible pendant la diffusion", async () => {
    prisma.conversationMember.findMany.mockRejectedValue(new Error('DatabaseNotReachable'));

    await expect(service.handleSocketConnected('user-1', 'socket-a')).resolves.toBeUndefined();
    // L'état en mémoire reste correct malgré l'échec de diffusion.
    expect(await service.isOnline('user-1')).toBe(true);
  });
});

describe('PresenceService — conversation ouverte', () => {
  const build = () =>
    new PresenceService(
      { profile: { findUnique: jest.fn().mockResolvedValue(null) }, user: { update: jest.fn() }, conversationMember: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService,
      { client: null } as unknown as RedisService,
      { emitToUsers: jest.fn() } as unknown as EventsGateway,
    );

  it("considère qu'un utilisateur regarde une conversation dès qu'un de ses sockets l'affiche", async () => {
    const service = build();
    await service.handleSocketConnected('u1', 's1');
    await service.handleSocketConnected('u1', 's2');
    await service.setOpenConversation('s2', 'conv-1');

    await expect(service.isViewingConversation('u1', 'conv-1')).resolves.toBe(true);
    await expect(service.isViewingConversation('u1', 'conv-2')).resolves.toBe(false);
  });

  it('cesse de la considérer ouverte après conversation:closed ou déconnexion du socket', async () => {
    const service = build();
    await service.handleSocketConnected('u1', 's1');
    await service.setOpenConversation('s1', 'conv-1');
    await service.setOpenConversation('s1', null);
    await expect(service.isViewingConversation('u1', 'conv-1')).resolves.toBe(false);

    await service.setOpenConversation('s1', 'conv-1');
    await service.handleSocketDisconnected('u1', 's1');
    await expect(service.isViewingConversation('u1', 'conv-1')).resolves.toBe(false);
  });

  it('isAnyOnline : vrai si au moins un destinataire est connecté', async () => {
    const service = build();
    await service.handleSocketConnected('u2', 's9');
    await expect(service.isAnyOnline(['u1', 'u2'])).resolves.toBe(true);
    await expect(service.isAnyOnline(['u1', 'u3'])).resolves.toBe(false);
  });
});
