# Déploiement Riiberaka

Vercel (4 PWA) · Render (API NestJS + Redis, sans Docker) · Neon (PostgreSQL) · Cloudinary (images).

## 1. Neon (base de données)
1. Créer un projet, région proche de Render (ex. Frankfurt).
2. Récupérer deux chaînes : **poolée** (hôte avec `-pooler`) → `DATABASE_URL` ; **directe** (sans `-pooler`) → `DIRECT_URL` (utilisée seulement par `prisma migrate deploy`, voir `backend/prisma.config.ts`).

## 2. Render (API + Redis)
1. « New → Blueprint » sur le dépôt : `render.yaml` crée `riiberaka-api` et `riiberaka-redis`.
2. Renseigner les variables `sync: false` (Cloudinary est **obligatoire** : sans `CLOUDINARY_*` l'API refuse de démarrer) : `DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`, `CLOUDINARY_*`, `ZAVUDEV_API_KEY`, `ZAVU_SENDER`, `VAPID_*`.
   - `CORS_ORIGIN` : les 4 origines Vercel en HTTPS, séparées par des virgules (sans `/` final).
   - VAPID (**obligatoire**, l'API refuse de démarrer sans) : `npx web-push generate-vapid-keys`, une seule fois — changer la paire déconnecte toutes les notifications déjà activées.
   - TURN (fortement recommandé) : `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`. Sans eux, les appels vocaux passent par un relais public gratuit peu fiable (l'API le signale au démarrage).
3. Les secrets JWT sont générés par Render. Le serveur refuse de démarrer en production si un secret est faible, si `REGISTRATION_OTP_ENABLED` n'est pas `true` avec un vrai fournisseur SMS, ou si Redis est absent.
4. À chaque déploiement : `npm ci` → `nest build` → `prisma migrate deploy` (pré-déploiement) → `node dist/src/main`. Santé : `GET /api/v1/health`.
5. `TRUST_PROXY_HOPS=2` (Vercel puis Render). Après le premier déploiement, vérifier qu'un client voit bien sa propre IP dans les journaux ; ajuster à 1 si l'IP affichée est celle de Vercel.
6. Premier administrateur (une fois, depuis le Shell Render) : `SEED_ADMIN_PHONE=... SEED_ADMIN_PASSWORD=... npm run prisma:seed -w backend`. **Jamais `SEED_DEMO=true` en production.**
7. Tous les médias (images publiques, vocaux, pièces d'identité — ces deux derniers en accès signé) sont sur Cloudinary : l'API ne stocke rien sur disque et peut tourner sur plusieurs instances (Redis assure le temps réel).

## 3. Vercel (4 projets, un par application)
Pour chaque dossier `client`, `restaurant`, `livreur`, `admin` : « Add New Project », **Root Directory** = le dossier, « Include source files outside of the Root Directory » activé (workspaces npm), framework Next.js.

Variables (Production), identiques pour les 4 apps :

| Variable | Valeur |
|---|---|
| `BACKEND_URL` | `https://riiberaka-api.onrender.com` (relais serveur de `/api/v1/*`, jamais exposé au navigateur) |
| `NEXT_PUBLIC_WS_URL` | la même URL — lue **à la compilation** : la définir avant le premier build, redéployer si elle change |

Les cookies d'authentification restent « same-site » car le navigateur n'appelle que son propre domaine Vercel ; seul le WebSocket Socket.IO va directement à Render (autorisé par la CSP `connect-src` et par `CORS_ORIGIN`).

## 4. Redis
Fourni par `render.yaml` (Key Value, accès interne uniquement). Alternative : Upstash → coller son `rediss://…` dans `REDIS_URL`.

## 5. Notifications push et appels
Les PWA (client, restaurant, livreur) enregistrent leur service worker et proposent d'activer les notifications ; l'abonnement est lié à la session et recréé à chaque connexion. Un appel entrant hors application affiche « Répondre / Refuser » ; « Refuser » ne demande aucune ouverture de l'app. HTTPS est indispensable (Vercel le fournit).

## 6. Vérifications après mise en ligne
- `GET /api/v1/health` répond 200.
- Inscription client (SMS reçu), connexion, commande en espèces, suivi.
- Restaurant : réception temps réel d'une commande. Livreur : offre de course. Admin : validation d'un restaurant.
- Activer les notifications sur un téléphone restaurant, fermer l'app, passer une commande : la notification arrive. Appeler ce téléphone : « Répondre / Refuser » s'affiche.
- Redéployer l'API, puis vérifier qu'un vocal et une image envoyés avant le redéploiement sont toujours lisibles.

## 7. Ce qui n'est PAS prêt
- Paiement TMoney / Flooz / carte : non branché (affiché « Bientôt », désactivé). Nécessite un fournisseur réel et ses clés (`PAYMENT_*`).
- E-mail transactionnel : `MAIL_PROVIDER=none` (les liens de réinitialisation sont journalisés, pas envoyés).
