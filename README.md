# Riiberaka

Plateforme de commande de repas pour le Togo : **un backend NestJS central** et
**quatre applications web** (PWA client, PWA restaurant, PWA livreur, backoffice admin).

```
riibos/
├── backend/      NestJS · Prisma · PostgreSQL · Redis · Socket.IO   ← 351 tests unitaires + e2e
├── client/       PWA client       (Next.js)                          ← port 3000
├── restaurant/   PWA restaurant   (Next.js)                          ← port 3001
├── livreur/      PWA livreur      (Next.js)                          ← port 3002
└── admin/        Backoffice admin (Next.js)                          ← port 3003
```

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour les décisions et l'avancement.

## Démarrer le backend en local

Prérequis : Node 24, PostgreSQL 16, Redis. Pas de Docker.

```bash
npm install                       # à la racine (workspaces)
cd backend
cp .env.example .env              # puis remplacer les secrets (openssl rand -hex 32)
npx prisma migrate deploy         # crée le schéma
SEED_DEMO=true SEED_ADMIN_PHONE=+228XXXXXXXX SEED_ADMIN_PASSWORD=... npx ts-node prisma/seed.ts
npm run start:dev                 # http://localhost:4000/api/v1  ·  Swagger : /api/v1/docs
```

`./start-all.sh` relance Postgres privé, backend et les 4 espaces web (une fois construits avec `npx next build`).
Lancer les espaces web depuis la racine : `npm run dev:client`,
`npm run dev:restaurant`, `npm run dev:livreur` ou `npm run dev:admin`.

Comptes de démonstration (`SEED_DEMO=true`, mot de passe `demo12345`) :
client `+22890100001` · livreur `+22890300001` · restaurants `+22890200001`, `…02`, `…03`.

## Tests

```bash
npm run test:backend                          # unitaires
cd backend && npm run test:e2e                # e2e : base `riiberaka_test` (voir .env.test) + Redis
```

## Base PostgreSQL de développement isolée

Si vous ne voulez pas utiliser un Postgres existant, un cluster privé peut vivre dans `.pgdata/` (ignoré par git) :

```bash
PGBIN=/usr/lib/postgresql/16/bin
$PGBIN/initdb -D .pgdata -U riiberaka --auth=trust -E UTF8
$PGBIN/pg_ctl -D .pgdata -o "-p 5544 -c unix_socket_directories=/tmp" -l .pgdata/server.log start
$PGBIN/createdb -h localhost -p 5544 -U riiberaka riiberaka
```
# riibo
