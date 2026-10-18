import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovedGuard } from './approved.guard';

function context(role: Role): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', sessionId: 's1', role } }) }),
  } as unknown as ExecutionContext;
}

describe('ApprovedGuard', () => {
  const prisma = {
    restaurantMember: { findFirst: jest.fn() },
    driverProfile: { findUnique: jest.fn() },
  };
  const guard = new ApprovedGuard(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('laisse passer un CLIENT sans consulter la base', async () => {
    await expect(guard.canActivate(context('CLIENT'))).resolves.toBe(true);
    expect(prisma.restaurantMember.findFirst).not.toHaveBeenCalled();
  });

  it('refuse un restaurant dont aucun établissement n\'est approuvé', async () => {
    prisma.restaurantMember.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(context('RESTAURANT'))).rejects.toThrow(ForbiddenException);
  });

  it('laisse passer un restaurant approuvé', async () => {
    prisma.restaurantMember.findFirst.mockResolvedValue({ id: 'm1' });
    await expect(guard.canActivate(context('RESTAURANT'))).resolves.toBe(true);
    expect(prisma.restaurantMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', restaurant: { status: 'APPROVED' } } }),
    );
  });

  it.each(['PENDING', 'IN_REVIEW', 'REJECTED', 'SUSPENDED'])(
    'refuse un livreur %s',
    async (status) => {
      prisma.driverProfile.findUnique.mockResolvedValue({ status });
      await expect(guard.canActivate(context('LIVREUR'))).rejects.toThrow(ForbiddenException);
    },
  );

  it('refuse un livreur sans profil', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context('LIVREUR'))).rejects.toThrow(ForbiddenException);
  });

  it('laisse passer un livreur approuvé', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({ status: 'APPROVED' });
    await expect(guard.canActivate(context('LIVREUR'))).resolves.toBe(true);
  });
});
