import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Un restaurant ou un livreur n'a AUCUN droit opérationnel (recevoir des
 * commandes, des courses, gérer un menu...) tant qu'un admin n'a pas approuvé
 * son compte. À poser après `JwtAuthGuard` et `RolesGuard` sur les routes
 * opérationnelles ; les routes d'inscription/complétion de dossier, elles,
 * n'ont volontairement pas ce guard.
 *
 * L'état d'approbation est relu en base à chaque requête : une suspension
 * prend effet immédiatement.
 */
@Injectable()
export class ApprovedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException('Compte non validé.');

    if (user.role === 'RESTAURANT') {
      const approved = await this.prisma.restaurantMember.findFirst({
        where: { userId: user.userId, restaurant: { status: 'APPROVED' } },
        select: { id: true },
      });
      if (!approved) throw new ForbiddenException("Votre restaurant n'est pas encore validé.");
      return true;
    }

    if (user.role === 'LIVREUR') {
      const driver = await this.prisma.driverProfile.findUnique({
        where: { userId: user.userId },
        select: { status: true },
      });
      if (driver?.status !== 'APPROVED') {
        throw new ForbiddenException("Votre compte livreur n'est pas encore validé.");
      }
      return true;
    }

    // CLIENT / ADMIN : pas de processus d'approbation.
    return true;
  }
}
