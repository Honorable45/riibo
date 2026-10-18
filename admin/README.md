# Riiberaka Admin

Backoffice d’administration de Riiberaka (Next.js 16, App Router, TypeScript,
Tailwind CSS 4, TanStack Query). Il pilote la plateforme à partir des données
réelles du backend NestJS (`../backend`) : commandes, restaurants, plats,
comptes, livreurs, finances, promotions, signalements, journal d’audit.

État détaillé, limites et tests : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Lancer en local

Prérequis : Node 24, backend démarré (PostgreSQL + Redis), dépendances installées
à la racine du dépôt (`npm install`, workspaces).

```bash
# depuis la racine du dépôt
npm run dev:admin                       # http://localhost:3003

# ou depuis admin/, avec un backend sur un autre port
BACKEND_URL=http://localhost:4100 npx next dev -p 3003
```

| Variable | Rôle |
|---|---|
| `BACKEND_URL` | Origine du backend, sans `/api/v1` (défaut `http://localhost:4000`). Lue côté serveur Next uniquement. |

Aucune clé secrète n’est utilisée ni exposée par l’admin. Le navigateur ne
parle qu’à l’origine de l’admin : `/api/v1/*` est relayé vers le backend, ce
qui garde les cookies de session httpOnly « same-site ».

## Accès

Seuls les comptes de rôle `ADMIN` actifs entrent. Aucun endpoint ne crée
d’administrateur : le compte est créé par le seed du backend
(`SEED_ADMIN_PHONE` et `SEED_ADMIN_PASSWORD`). Chaque route `/admin/*` est
vérifiée par le backend (`AdminGuard`, rôle relu en base à chaque requête) ;
l’interface ne fait que refléter ces droits.

## Commandes

```bash
npm run lint        # ESLint (config Next)
npm run typecheck   # TypeScript
npm test            # Vitest : règles, client HTTP, garde d’accès, confirmations
npm run build       # build de production
npm start           # sert le build sur le port 3003
```

## Production

- Déployer derrière HTTPS, avec `BACKEND_URL` pointant vers l’API.
- Ajouter l’origine de l’admin à `CORS_ORIGIN` du backend.
- `NODE_ENV=production` côté backend rend les cookies `Secure`.
- Le site envoie `X-Robots-Tag: noindex` et refuse l’affichage en iframe.
