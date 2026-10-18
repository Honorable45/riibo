import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function context(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: Role[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('laisse passer une route sans @Roles()', () => {
    expect(guardRequiring(undefined).canActivate(context({ role: 'CLIENT' }))).toBe(true);
  });

  it('laisse passer un rôle autorisé', () => {
    expect(guardRequiring(['RESTAURANT']).canActivate(context({ role: 'RESTAURANT' }))).toBe(true);
  });

  it('refuse un rôle non autorisé', () => {
    expect(() => guardRequiring(['RESTAURANT']).canActivate(context({ role: 'CLIENT' }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse un CLIENT sur une route ADMIN', () => {
    expect(() => guardRequiring(['ADMIN']).canActivate(context({ role: 'CLIENT' }))).toThrow(
      ForbiddenException,
    );
  });

  it("refuse quand aucun utilisateur n'est attaché à la requête", () => {
    expect(() => guardRequiring(['ADMIN']).canActivate(context(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
