import type { PrismaClient } from '@prisma/client';

/**
 * Un utilisateur ne peut avoir qu'un seul appel actif (sonnerie ou en cours) à
 * la fois. Fonction autonome, utilisable dans une transaction : la vérification
 * et la création de l'appel restent atomiques (deux invitations quasi
 * simultanées vers/depuis le même utilisateur ne doivent jamais réussir toutes
 * les deux).
 */
export async function isUserInAnyCall(
  prisma: Pick<PrismaClient, 'call'>,
  userId: string,
): Promise<boolean> {
  const call = await prisma.call.findFirst({
    where: {
      status: { in: ['RINGING', 'ACTIVE'] },
      OR: [{ callerId: userId }, { calleeId: userId }],
    },
    select: { id: true },
  });
  return call !== null;
}
