import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PresenceInfo, PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAvatarUrl } from '../profiles/avatar.util';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_WITH_RELATIONS = {
  profile: true,
  restaurantMemberships: {
    include: { restaurant: { select: { id: true, name: true, slug: true, status: true } } },
  },
  driverProfile: { select: { id: true, status: true, isOnline: true, isAvailable: true } },
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof USER_WITH_RELATIONS }>;

/** Vue complète pour le propriétaire du compte ("moi") — jamais renvoyée pour un autre utilisateur. */
function toMeDto(user: UserWithRelations, presence: PresenceInfo) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    // Sert uniquement à afficher la bonne interface : chaque route protégée
    // revérifie le rôle en base côté serveur (voir RolesGuard).
    role: user.role,
    isOnline: presence.isOnline,
    lastSeenAt: presence.lastSeenAt,
    // Restaurants gérés par ce compte, avec leur statut d'approbation : les
    // PWA restaurant/livreur s'en servent pour afficher "en attente de
    // validation" plutôt qu'un tableau de bord inutilisable.
    restaurants: user.restaurantMemberships.map((membership) => ({
      ...membership.restaurant,
      memberRole: membership.role,
    })),
    driver: user.driverProfile,
    profile: user.profile
      ? {
          avatarUrl: resolveAvatarUrl(user.profile, user.id),
          // Distingue un avatar téléversé (bouton "Supprimer" pertinent) d'une
          // URL externe saisie à la main.
          avatarUploaded: Boolean(user.profile.avatarStorageKey),
          showLastSeen: user.profile.showLastSeen,
          showOnlineStatus: user.profile.showOnlineStatus,
          showReadReceipts: user.profile.showReadReceipts,
          notificationsEnabled: user.profile.notificationsEnabled,
          hideNotificationContent: user.profile.hideNotificationContent,
        }
      : null,
    createdAt: user.createdAt,
  };
}

/** Vue publique — ce que voit un autre utilisateur (jamais email/téléphone/préférences privées). */
function toPublicDto(
  user: Prisma.UserGetPayload<{ include: { profile: true } }>,
  presence: PresenceInfo,
) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatarUrl: resolveAvatarUrl(user.profile, user.id),
    isOnline: presence.isOnline,
    lastSeenAt: presence.lastSeenAt,
  };
}

export type MeDto = ReturnType<typeof toMeDto>;
export type PublicUserDto = ReturnType<typeof toPublicDto>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_WITH_RELATIONS,
    });
    // respectPrivacy: false — on ne cache jamais à quelqu'un ses propres réglages.
    const presence = await this.presence.getPresence(userId, false);
    return toMeDto(user, presence);
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<MeDto> {
    await this.assertIdentifiersAvailable(userId, dto);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
      },
    });
    return this.getMe(userId);
  }

  /**
   * Profil public d'un utilisateur — les identifiants sont des cuid non
   * devinables, et il n'existe volontairement AUCUNE recherche d'utilisateurs
   * (pas d'énumération des comptes par un client).
   */
  async getPublicProfile(targetUserId: string): Promise<PublicUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { profile: true },
    });
    if (!user || !user.isActive) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    const presence = await this.presence.getPresence(targetUserId);
    return toPublicDto(user, presence);
  }

  /** Vérifie unicité username/email en s'excluant soi-même. */
  private async assertIdentifiersAvailable(userId: string, dto: UpdateUserDto): Promise<void> {
    const checks: Array<Promise<void>> = [];

    if (dto.username) {
      checks.push(
        this.prisma.user.findUnique({ where: { username: dto.username } }).then((existing) => {
          if (existing && existing.id !== userId) {
            throw new ConflictException("Ce nom d'utilisateur est déjà pris.");
          }
        }),
      );
    }
    if (dto.email) {
      checks.push(
        this.prisma.user.findUnique({ where: { email: dto.email } }).then((existing) => {
          if (existing && existing.id !== userId) {
            throw new ConflictException('Cet email est déjà utilisé.');
          }
        }),
      );
    }

    await Promise.all(checks);
  }
}
