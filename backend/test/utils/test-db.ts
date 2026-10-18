import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
}

/**
 * Vide toutes les tables entre deux suites e2e, sauf la table interne de suivi
 * des migrations. Découvre les tables dynamiquement plutôt
 * que de les lister à la main : reste correct si le schéma évolue.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const KEEP = new Set(['_prisma_migrations']);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const targets = tables.map((t) => t.tablename).filter((name) => !KEEP.has(name));
  if (targets.length === 0) return;

  const statement = `TRUNCATE TABLE ${targets.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`;

  // Le TRUNCATE prend un verrou exclusif sur toutes les tables. La suite e2e
  // précédente peut encore avoir des écritures asynchrones en vol (lastSeenAt à
  // la déconnexion d'un socket, notifications, push lancés sans attente) : les
  // deux se bloquent alors mutuellement (`40P01 deadlock detected`). PostgreSQL
  // en annule une, on réessaie — jamais en boucle infinie.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(statement);
      return;
    } catch (error) {
      const retriable = /40P01|deadlock detected/.test(String(error));
      if (!retriable || attempt >= 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
}
