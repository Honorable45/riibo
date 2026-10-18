import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import type { Role } from '@prisma/client';

/**
 * À poser APRÈS `JwtAuthGuard`. Le rôle comparé est celui que JwtStrategy a
 * relu EN BASE pour cette requête (voir assertSessionActive) — jamais un claim
 * du JWT : une suspension ou un changement de rôle prend effet immédiatement.
 *
 * Refus par défaut : sans `@Roles()`, la route reste ouverte à tout utilisateur
 * authentifié (le guard n'a rien à restreindre).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Vous n'avez pas accès à cette ressource.");
    }
    return true;
  }
}
