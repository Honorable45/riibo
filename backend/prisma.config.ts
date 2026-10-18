import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Configuration Prisma 7 pour la CLI (migrate, studio, generate). Le runtime
// applicatif (PrismaService) configure sa propre connexion via un driver
// adapter — voir src/prisma/prisma.service.ts.
//
// Neon : DIRECT_URL (connexion directe, non poolée) est requise pour
// `prisma migrate` ; DATABASE_URL (poolée) sert au runtime. En local, seule
// DATABASE_URL est nécessaire.
//
// `prisma generate` (postinstall) n'ouvre aucune connexion : sans URL, on
// injecte une valeur factice explicite plutôt que de faire échouer
// `npm install`. `migrate` échouera alors avec une erreur de connexion claire.
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://unset:unset@localhost:5432/unset';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
