import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RestaurantMember, RestaurantMemberRole } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

export const RESTAURANT_ROLE_KEY = 'restaurantMemberRole';
export const RESTAURANT_OPERATIONAL_KEY = 'restaurantOperational';

/**
 * Réserve la route à un restaurant APPROUVÉ (commandes, opérations). Sans elle,
 * un restaurant en attente de validation peut préparer son profil et son menu.
 */
export const RestaurantOperational = () => SetMetadata(RESTAURANT_OPERATIONAL_KEY, true);

/** Rôle minimal requis dans le restaurant visé par `:restaurantId` (défaut : STAFF, OWNER est plus restrictif). */
export const RestaurantRole = (role: RestaurantMemberRole = 'STAFF') =>
  SetMetadata(RESTAURANT_ROLE_KEY, role);

export type RestaurantRequest = Request & {
  user: AuthenticatedUser;
  restaurantMember: RestaurantMember;
};

/**
 * Garde d'appartenance : l'utilisateur doit être membre du restaurant désigné
 * par le paramètre de route `restaurantId`. Aucune route « espace restaurant »
 * ne déduit le restaurant d'une valeur fournie par le client dans le corps :
 * un membre du restaurant A ne peut donc jamais agir sur le restaurant B.
 *
 * 404 (et non 403) pour un non-membre : ne rien révéler de l'existence du restaurant.
 */
@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RestaurantRequest>();
    const restaurantId = request.params.restaurantId;
    if (typeof restaurantId !== 'string') throw new NotFoundException('Restaurant introuvable.');

    const member = await this.prisma.restaurantMember.findUnique({
      where: { restaurantId_userId: { restaurantId, userId: request.user.userId } },
    });
    if (!member) throw new NotFoundException('Restaurant introuvable.');

    const required = this.reflector.getAllAndOverride<RestaurantMemberRole | undefined>(
      RESTAURANT_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required === 'OWNER' && member.role !== 'OWNER') {
      throw new ForbiddenException('Réservé au propriétaire du restaurant.');
    }

    const operational = this.reflector.getAllAndOverride<boolean | undefined>(
      RESTAURANT_OPERATIONAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (operational) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { status: true },
      });
      if (restaurant?.status !== 'APPROVED') {
        throw new ForbiddenException("Votre restaurant n'est pas (ou plus) validé.");
      }
    }

    request.restaurantMember = member;
    return true;
  }
}
