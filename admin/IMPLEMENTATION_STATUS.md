# Riiberaka Admin — état d'implémentation

Audit du 2026-10-18. Une fonctionnalité n'est « vérifiée » que si elle a été
exécutée contre le vrai backend (base de développement locale).

## 1. Audit (phase 1)

### Dépôt
- **Pas de dépôt Git** : aucun historique ni état à préserver par `git status`.
- `package.json` racine déclare les workspaces `backend client restaurant
  livreur admin`, mais **seul `backend/` existe**. Les quatre applications
  web Next.js (dont l'ancien admin) ont été supprimées avant ce travail ; le
  développeur a demandé de ne pas les restaurer. Les applications client,
  restaurant et livreur existent désormais en Flutter (`mobile/`).
- L'admin est donc **reconstruit** dans `admin/`, selon les conventions
  décrites dans `ARCHITECTURE.md` : Next.js (App Router, TypeScript),
  Tailwind CSS 4, TanStack Query, relais `/api/v1/*` vers le backend pour
  que les cookies httpOnly restent « same-site », port 3003.
- Disque : 1,2 Go libres au départ. Libéré en supprimant les dossiers
  `build/` Flutter (régénérables) ; APK conservés dans `mobile/apk/`.

### Backend (NestJS 12, Prisma 7, PostgreSQL 16, Redis, Socket.IO)
- Authentification web : `POST /auth/login` (téléphone ou e-mail + mot de
  passe) pose `riiberaka_access` (15 min, httpOnly, SameSite=Lax, chemin
  `/api/v1`) et `riiberaka_refresh` (60 j, chemin `/api/v1/auth/refresh`).
  `POST /auth/refresh` lit le cookie ; `POST /auth/logout` révoque la session.
- Rôles : `CLIENT, RESTAURANT, LIVREUR, ADMIN`. Aucun endpoint ne crée
  d'ADMIN (seed uniquement). `AdminGuard` relit **en base** rôle et
  `isActive` à chaque requête ; une session d'un compte désactivé est
  refusée (`session-validation.util.ts`).
- Machine à états `OrderStateMachineService` : seule à écrire
  `Order.status` ; l'admin peut **annuler** une commande non terminée (motif
  obligatoire), action journalisée `ORDER_CANCELLED_BY_ADMIN`. Aucun autre
  pouvoir admin sur le statut.
- Journal d'audit : modèle `AuditLog` + `AuditService` (best-effort).
- Médias : `MediaService` → Cloudinary si configuré, sinon disque local
  servi sous `/api/v1/media/<dossier>/<uuid>.<ext>` ; vérification du format
  réel (signature) et de la taille (8 Mo).

### Endpoints admin existants (vérifiés en réel)

| Route | Contenu |
|---|---|
| `GET /admin/overview` | commandes du jour par état, « revenueToday » (repas − remises des commandes livrées du jour), 7 jours, restaurants/livreurs par statut, clients |
| `GET /admin/metrics` | utilisateurs, messages, appels, signalements en attente |
| `GET /admin/users?q&cursor&limit` | recherche nom d'utilisateur / e-mail seulement |
| `PATCH /admin/users/:id {isActive}` | suspension / réactivation |
| `GET /admin/reports`, `PATCH /admin/reports/:id` | signalements (modération) |
| `GET/PATCH /admin/restaurants[/:id[/status]]`, `GET …/documents/:type` | dossiers, transitions START_REVIEW/APPROVE/REJECT/SUSPEND/REACTIVATE (motif), pièces privées (consultation journalisée) |
| `GET/PATCH /admin/drivers[/:id[/status]]`, `GET …/documents/:type` | idem livreurs ; suspension refusée pendant une course |
| `GET/POST/PATCH /admin/promos` | codes promo (calcul et usage côté serveur, atomiques) |

### Manques (backend)
1. Aucune route admin **commandes** (liste, filtres, détail, annulation).
2. Aucune supervision **menus / plats** côté admin.
3. **Finances** : pas de commission, pas de règlement restaurant, pas de
   rémunération livreur (`Delivery.deliveryFee` = frais payés par le client).
   Seuls existent `Order` (repas, frais, remise, total) et `Payment`
   (fournisseur `cash` uniquement aujourd'hui ; statuts PENDING/PAID/…).
4. Pas de lecture du **journal d'audit**.
5. Pas de modèle de **paramètres** de plateforme.
6. Pas d'**historique de statuts** en table : il se reconstitue avec les
   horodatages de la commande (`acceptedAt`, `readyAt`…) et de la livraison,
   plus le journal d'audit pour les actions admin.

### Problèmes de sécurité / cohérence relevés
1. `PATCH /admin/users/:id` n'est **pas journalisé** et permet à un admin de
   se suspendre lui-même ou de suspendre un autre admin.
2. Création / modification de codes promo **non journalisées**.
3. `GET /admin/users` ne cherche ni par téléphone ni par nom, ni par rôle.
4. `revenueToday` est le montant des repas encaissable par les restaurants,
   pas un revenu Riiberaka : l'admin doit l'étiqueter comme tel.

### Données de démonstration
Base locale : 5 restaurants (4 validés), 15 plats **sans aucune image**,
26 commandes, paiements `cash` uniquement. Un compte admin de développement
(`+22890900001`) a été créé par le seed (`SEED_ADMIN_*`) pour les tests ;
son mot de passe n'est pas dans le dépôt.

## 2. Plan

| Phase | Contenu |
|---|---|
| 2 | Backend : routes admin manquantes (commandes, plats, finances, journal, configuration), corrections de sécurité ; app Next.js, session par cookies, garde de rôle |
| 3 | Mise en page, navigation, composants communs, responsive |
| 4 | Tableau de bord sur données réelles, filtres de période |
| 5 | Commandes : liste, filtres, fiche, annulation motivée |
| 6 | Restaurants, menus, plats, images |
| 7 | Clients, livreurs |
| 8 | Finances (sans commission inventée), promotions |
| 9 | Signalements, journal d'audit, configuration (lecture seule, sans secrets) |
| 10 | Images de plats réelles et sous licence (Wikimedia Commons) pour la démo, seed réservé au développement |
| 11 | Tests, build, documentation |

## 3. Avancement

_Mis à jour à la fin de chaque phase (voir plus bas)._
