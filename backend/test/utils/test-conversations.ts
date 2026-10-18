import type { ConversationKind, PrismaClient } from '@prisma/client';

/**
 * Crée directement en base une conversation entre ces utilisateurs — ce que
 * fait le serveur (OrdersService/DeliveriesService) quand une commande est
 * passée. Un client ne peut plus créer de conversation via l'API : seul le
 * serveur le fait, donc les tests posent la conversation par ce chemin.
 */
export async function createConversationBetween(
  prisma: PrismaClient,
  userIds: string[],
  kind: ConversationKind = 'DIRECT',
): Promise<string> {
  const conversation = await prisma.conversation.create({
    data: { type: 'DIRECT', kind, members: { create: userIds.map((userId) => ({ userId })) } },
  });
  return conversation.id;
}
