import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Profile, User } from '@prisma/client';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'jean',
    email: 'jean@example.com',
    phone: '+22890000001',
    passwordHash: 'hashed',
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
    phoneHash: null,
    firstName: 'Jean',
    lastName: 'K.',
    role: 'CLIENT',
    isActive: true,
    suspendedReason: null,
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

describe('UsersService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
  };
  let presence: { getPresence: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    };
    presence = { getPresence: jest.fn().mockResolvedValue({ isOnline: false, lastSeenAt: null }) };
    service = new UsersService(
      prisma as unknown as PrismaService,
      presence as unknown as PresenceService,
    );
  });

  describe('getMe', () => {
    it('renvoie le rôle, les restaurants gérés et le profil livreur', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...buildUser({ role: 'RESTAURANT' }),
        profile: buildProfile(),
        restaurantMemberships: [
          {
            role: 'OWNER',
            restaurant: { id: 'r1', name: 'Chez Maman', slug: 'chez-maman', status: 'PENDING' },
          },
        ],
        driverProfile: null,
      });

      const me = await service.getMe('user-1');

      expect(me.role).toBe('RESTAURANT');
      expect(me.restaurants).toEqual([
        { id: 'r1', name: 'Chez Maman', slug: 'chez-maman', status: 'PENDING', memberRole: 'OWNER' },
      ]);
      expect(me.driver).toBeNull();
    });

    it('ne renvoie jamais le hash du mot de passe', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...buildUser(),
        profile: buildProfile(),
        restaurantMemberships: [],
        driverProfile: null,
      });

      const me = await service.getMe('user-1');

      expect(me).not.toHaveProperty('passwordHash');
    });
  });

  describe('updateMe', () => {
    it("refuse un nom d'utilisateur déjà pris par un autre compte", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'autre-user' }));

      await expect(service.updateMe('user-1', { username: 'jean' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuse un email déjà utilisé par un autre compte', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'autre-user' }));

      await expect(
        service.updateMe('user-1', { email: 'jean@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('autorise à garder son propre username (pas de conflit avec soi-même)', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-1' }));
      prisma.user.update.mockResolvedValue(buildUser());
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...buildUser(),
        profile: buildProfile(),
        restaurantMemberships: [],
        driverProfile: null,
      });

      await expect(service.updateMe('user-1', { username: 'jean' })).resolves.toBeDefined();
    });

    it('ne modifie jamais le rôle ni le téléphone', async () => {
      prisma.user.update.mockResolvedValue(buildUser());
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...buildUser(),
        profile: buildProfile(),
        restaurantMemberships: [],
        driverProfile: null,
      });

      await service.updateMe('user-1', { firstName: 'Jeanne' });

      const data = (prisma.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(Object.keys(data)).not.toContain('role');
      expect(Object.keys(data)).not.toContain('phone');
    });
  });

  describe('getPublicProfile', () => {
    it('renvoie 404 si le compte est introuvable ou désactivé', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getPublicProfile('inconnu')).rejects.toBeInstanceOf(NotFoundException);

      prisma.user.findUnique.mockResolvedValue({
        ...buildUser({ isActive: false }),
        profile: buildProfile(),
      });
      await expect(service.getPublicProfile('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ne renvoie jamais email/téléphone dans la vue publique', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...buildUser(), profile: buildProfile() });

      const result = await service.getPublicProfile('user-1');

      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
    });
  });
});
