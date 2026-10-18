# Riiberaka — architecture

> **Document mis à jour.** Le projet vit désormais dans `riibos/` (backend + 3 PWA + admin).
> Les sections numérotées ci-dessous sont la proposition de Phase 1 ; cette première
> partie liste ce qui a **changé depuis** et l'état d'avancement. En cas de contradiction,
> cette partie prévaut.

## Changements depuis la proposition de Phase 1

| Sujet | Décision |
|---|---|
| Emplacement | Nouveau dossier `riibos/`, les deux backends d'origine restent intacts. Un seul `node_modules` (workspaces npm) : le disque de développement est presque plein. |
| Applications | **4 applications distinctes** au lieu d'un frontend unique : `client/`, `restaurant/`, `livreur/`, `admin/` (Next.js, PWA), un seul backend. |
| Sessions | Chaque PWA a sa propre origine donc sa propre session. Elle proxifie `/api/v1/*` vers le backend (rewrites Next.js) pour garder des cookies httpOnly « same-site ». Le WebSocket, qui ne passe pas par ce proxy, s'authentifie avec un jeton de 2 min obtenu par `POST /auth/socket-token`. |
| Chat | Uniquement client↔restaurant, client↔livreur, restaurant↔livreur, et support. **Aucune recherche d'utilisateur, aucun contact, aucun groupe exposé, aucune traduction/transcription.** Types : texte, vocal, position, média, **appels** (audio/vidéo 1:1, signalisation WebRTC conservée de Glotta). |
| Création de conversation | Réservée au serveur (`ConversationsService.ensure*`). Le client ne fournit jamais de liste de participants. Seule exception : `POST /conversations/support`. |
| Rôle | Fixé par le serveur (`accountType` → rôle), **relu en base à chaque requête** (plus jamais lu dans le JWT). Restaurant/livreur : statut `PENDING` jusqu'à approbation (`ApprovedGuard`). |
| Téléphone | Obligatoire à l'inscription, **jamais marqué vérifié sans code OTP réellement contrôlé** (le code d'origine le marquait vérifié quand l'OTP était désactivé). |
| API | Préfixe `/api/v1`, constante unique `API_PREFIX`. |

## Avancement

| Phase | État |
|---|---|
| 1 Analyse | ✅ |
| 2 Fondations backend : schéma unifié, auth + rôles, présence Redis, adaptateur Socket.IO, appels, seed | ✅ |
| 3 Restaurants, horaires, menu, options, approbation admin, médias | ✅ |
| 5 Panier serveur, carnet d'adresses | ✅ |
| 6 Commandes + machine à états (backend), tableau de bord du jour | ✅ |
| 8 Livraison : livreur, approbation, appariement, codes anti-fraude, suivi (backend) | ✅ |
| 9–10 Notifications et Web Push (backend) : durcissement, cycle de vie par session | ✅ (367 tests unitaires + 239 e2e) |
| 4 PWA client (accueil produits, restaurants, favoris, panier, commande, suivi avec carte, QR de remise, chat) | ✅ |
| 7 PWA restaurant (dashboard, commandes temps réel, menu, profil, chat) | ✅ |
| 8 PWA livreur (offres, course pas à pas, carte, GPS en ligne uniquement, chat) | ✅ |
| 9–10 Chat par commande (UI), notifications, Web Push | ✅ chat + notifications ; Web Push : backend prêt |
| 11 Paiements | à faire — seul le paiement à la livraison est réel ; TMoney/Flooz/carte affichés « Bientôt » |
| 12 Favoris (restaurants), admin (dossiers, utilisateurs, signalements, vue d'ensemble) | ✅ |
| 13 Promos (panier + commande, recalcul serveur, usage atomique) et avis (un par commande livrée, réponse du restaurant, modération admin) | ✅ |
| Notifications push + appels vocaux dans les 3 PWA (service worker, « Répondre / Refuser », reprise d'appel) | ✅ |
| 14–15 Tests de bout en bout, sécurité, perf, déploiement | audit complet du 2026-09-25 fait (voir DEPLOYMENT.md pour la mise en ligne) |

## Phase 3 — endpoints (tous sous `/api/v1`)

| Zone | Routes |
|---|---|
| Public (sans compte) | `GET /restaurant-categories` · `GET /restaurants` (`q`, `category`, `openNow`, `lat`+`lng`, `radiusKm`, `sort`, `page`, `limit≤30`) · `GET /restaurants/:idOrSlug` · `GET /restaurants/:idOrSlug/menu` · `GET /media/:folder/:file` |
| Restaurant (`RESTAURANT`, membre du restaurant) | `GET/PATCH /restaurant/:rid` · `POST …/images/logo\|cover` · `PUT …/hours` · `POST/DELETE …/closures` · `POST …/documents/:type` · `POST …/submit` · menu : `GET …/menu`, `POST/PATCH/DELETE …/menu/categories`, `POST/PATCH/DELETE …/menu/items`, `POST …/menu/items/:id/image`, `PUT …/menu/items/:id/options` |
| Admin | `GET /admin/restaurants` · `GET /admin/restaurants/:id` · `PATCH …/:id/status` (`START_REVIEW`, `APPROVE`, `REJECT`, `SUSPEND`, `REACTIVATE`) · `GET …/:id/documents/:type` |

Règles : un restaurant non `APPROVED` n'apparaît jamais au catalogue ; « ouvert/fermé » est calculé côté serveur (fuseau Africa/Lome, service coupé, passage de minuit, pause, fermetures exceptionnelles) ; un membre `STAFF` ne peut que mettre en pause et gérer le menu ; un restaurant préparant son dossier peut éditer profil et menu avant approbation ; les pièces justificatives sont privées (jamais dans une réponse, chaque consultation admin est journalisée) ; le statut ne change que par action nommée avec transition validée.

## Phases 5–6 — panier, adresses, commandes (sous `/api/v1`)

| Zone | Routes |
|---|---|
| Client | `GET/DELETE /cart` · `POST /cart/items` · `PATCH/DELETE /cart/items/:id` · `GET/POST /addresses`, `PATCH/DELETE /addresses/:id` · `POST /orders` · `GET /orders` (`scope=active\|past`) · `GET /orders/:id` · `POST /orders/:id/cancel` · `POST /orders/:id/reorder` |
| Restaurant approuvé | `GET …/dashboard` · `GET …/orders` · `POST …/orders/:id/accept\|reject\|start-preparing\|ready\|hand-over\|cancel` (préfixe `/restaurant/:rid`) |

**Principes**
- La commande est construite depuis le **panier serveur** : le client n'envoie jamais de plat, de prix, de total ni de statut (champs inconnus refusés). Chaque ligne est revalidée et rechiffrée depuis la base (`resolveSelection`, partagé panier/commande).
- **`OrderStateMachineService` est le seul écrit de `Order.status`**, à partir de la table `order-transitions.ts` (action × acteur × état de départ × type de commande). Il vérifie que l'acteur est partie à la commande (404 sinon), fait une mise à jour conditionnelle atomique, restitue le stock si annulée/refusée, notifie les autres parties, émet `order:*` en temps réel, journalise les actions admin. Le module livraison réutilisera cette machine (`ASSIGN`, `PICK_UP`, `ON_THE_WAY`, `DELIVER`).
- Anti-doublon et anti-survente : les lignes du panier sont « consommées » dans la transaction (un double envoi n'en crée qu'une commande) et le stock est décrémenté par une mise à jour conditionnelle (jamais négatif).
- Vues filtrées selon le rôle : le restaurant voit le prénom et le téléphone du client mais pas l'adresse exacte ; le client voit son adresse ; un tiers reçoit 404.
- À la création : conversation `ORDER_RESTAURANT` (client + tout le personnel), notification `ORDER_NEW`.
- **Pas encore** : paiement mobile (TMoney/Flooz refusés explicitement, seul le paiement à la livraison), revenus par période.

## Phase 8 — livraison (sous `/api/v1`)

| Zone | Routes |
|---|---|
| Livreur — dossier (avant approbation) | `GET/PATCH /driver/me` · `POST /driver/me/documents/:type` · `POST /driver/me/submit` |
| Livreur approuvé | `PUT /driver/me/availability` · `POST /driver/location` · `GET /driver/offers` · `POST /driver/offers/:deliveryId/accept\|reject` · `GET /driver/deliveries/current`, `GET /driver/deliveries`, `GET /driver/deliveries/:id` · `POST …/:id/at-restaurant\|pick-up\|arrived\|deliver\|release` |
| Suivi | `GET /orders/:id/tracking` (client, restaurant, livreur assigné, admin) · `POST /restaurant/:rid/orders/:orderId/retry-delivery` |
| Admin | `GET /admin/drivers`, `GET /admin/drivers/:id`, `PATCH …/:id/status`, `GET …/:id/documents/:type` |

**Déroulé.** La course naît quand le restaurant lance la préparation (`START_PREPARING`) : le livreur arrive ainsi au moment où le plat sort. Le balayeur (`DispatchService`, toutes les 10 s, verrou Redis) envoie des offres de 30 s aux 3 livreurs disponibles les plus proches dans un rayon de 3 → 5 → 8 → 12 km ; un refus exclut le livreur pour cette course ; sans réponse ni candidat, le tour suivant élargit le rayon ; après 4 tours, `NO_DRIVER_FOUND` (le restaurant relance). Si un livreur accepte pendant la préparation, la commande passe à `ASSIGNED` dès qu'elle est prête (observateur de la machine à états, sans dépendance circulaire).

**Sécurité.**
- Deux codes à 6 chiffres par course : **retrait** (lu au livreur par le restaurant) et **remise** (lu au livreur par le client). Chaque partie ne voit que le sien, jamais le livreur ; 5 échecs verrouillent 15 min (compteur Redis) ; comparaison à temps constant.
- **Position GPS jamais en base** : Redis (index géographique + clé à TTL 90 s), acceptée uniquement si le livreur est en ligne, diffusée (`delivery:location`) au seul client de sa course en cours, effacée à la mise hors ligne ou à la suspension.
- Avant acceptation, le livreur ne voit ni l'adresse exacte ni le contact du client. Un livreur n'accède qu'à SES courses (404 sinon) et n'en porte qu'une à la fois (condition atomique).
- Espèces (paiement à la livraison) : marquées encaissées automatiquement à `DELIVERED`, par la machine à états.
- Le désistement n'est possible qu'avant le retrait ; la commande repasse à « prête » (`UNASSIGN`) et le livreur est retiré des conversations. Un admin ne peut pas suspendre un livreur en pleine livraison.

## Phases 9–10 — notifications et Web Push (sous `/api/v1`)

Le centre de notifications (`GET /notifications`, `/unread-count`, `PATCH /:id/read`, `/read-all`) et l'abonnement Web Push (`GET /push/public-key`, `POST/DELETE /push/subscribe`) existaient déjà (Glotta). L'audit a corrigé trois défauts réels :

- **SSRF** : le serveur envoie une requête à l'`endpoint` fourni par le client. Il n'accepte plus que les hôtes des services de push officiels (Google/FCM, Mozilla, Apple, Windows), en HTTPS, sans identifiants ni port inhabituel ; clés `p256dh`/`auth` de forme stricte ; 10 abonnements par utilisateur au plus. Hôte supplémentaire possible via `PUSH_ENDPOINT_ALLOWED_HOSTS`.
- **Appareils partagés** : un abonnement est lié à la **session** qui l'a créé. Déconnexion, révocation d'une session, « déconnecter les autres appareils », expiration ou suspension du compte : plus aucune notification sur cet appareil. L'envoi ne cible que les sessions actives.
- **Notifications périmées** : durée de vie et urgence par type (offre de course 30 s / haute ; commande 10 min à 1 h / haute ; message 24 h / normale ; promotion 24 h / basse) et `tag` par commande ou conversation, pour qu'une mise à jour remplace la précédente à l'écran. Ces champs pilotent l'envoi et ne sont pas transmis à l'appareil. Nettoyage quotidien des notifications de plus de 90 jours.

Les clés VAPID se génèrent une fois : `npx web-push generate-vapid-keys` (voir `.env.example`). Sans elles, le push est désactivé et le temps réel (`notification:new`) continue de fonctionner. Les chemins ouverts au clic sont propres à chaque application : `/orders/:id`, `/deliveries/:id`, `/messages/:id`.

## Ce qui est déjà en place côté backend

`auth` (inscription par type de compte, connexion, refresh rotatif, sessions, reset mot de passe, OTP optionnel, jeton socket) ·
`users` · `profiles` · `conversations` + `messages` + `voice` (chat complet, fermeture des conversations de commande après 24 h) ·
`calls` · `presence` (Redis) · `notifications` + `push` (Web Push + FCM) · `uploads` (Cloudinary + local, validation de signature) ·
`restaurants` · `menu` · `carts` · `addresses` · `orders` · `deliveries` · `audit` · `reports` · `admin` (utilisateurs, signalements, approbation des restaurants) · `maintenance` · schéma Prisma complet (restaurants, menu, panier, commandes, livraison, paiement, promos, avis, favoris, audit).

---


Statut : **proposition, aucun code modifié.** Rédigée après lecture des deux backends
(schémas Prisma, modules, auth, gateways, services commande/livraison/chat/présence,
env, tests). Le backend food n'a pas de `node_modules` : son build n'a pas pu être
vérifié, seulement sa lecture.

---

## 1. Ce qui existe

| | **Glotta** (`backend/`) | **Food** (`Backend-main/`) |
|---|---|---|
| Rôle | Messagerie complète | Commande + livraison |
| Stack | Nest 12, Prisma 7.10, bcrypt | Nest 11, Prisma 7.8, bcryptjs |
| Taille | ~28 000 lignes, 37 suites de tests unitaires + 11 e2e | ~10 000 lignes, 2 specs + 3 e2e |
| Baseline | `tsc` OK, **514/515 tests OK** (1 échec préexistant : `OtpService › verify › maxAttempts`) | non vérifiable (deps absentes) |
| Auth | Sessions en base (`UserSession`), refresh rotatif + période de grâce, session revalidée en base à chaque requête, cookies httpOnly, OTP SMS, 2FA PIN, liaison QR web, validation des secrets au démarrage | JWT + `RefreshToken` rotatif avec détection de réutilisation, vérif. email, reset mdp, Google. **Le rôle est lu dans le JWT** |
| Temps réel | 1 gateway, rooms `user:<id>`, rate-limit socket, présence, suppression de notif si conversation ouverte | 3 gateways (`/chat`, `/location`, delivery) |
| Redis | Prévu, **non branché** (présence en `Map` mémoire) | `ioredis`, uniquement des verrous |
| Médias | Cloudinary + stockage local (vocaux), validation de signature de fichier | Cloudinary |
| Push | web-push (VAPID) + FCM, texte de push avec masquage | FCM seul |
| Métier | — | Restaurants (KYC/validation), menu, commandes, livraison (offres par rounds, rayon, codes de retrait/livraison), promos, avis, favoris, adresses, annonces, facture PDF, routing OSRM |

`riibo/backend` est **identique** à `../chat/backend` (aucune différence) : la copie de travail est sûre.

## 2. Décision de base

**Glotta est la base du backend unifié. Le domaine Food y est réintégré, module par module, réécrit selon les conventions Glotta — pas copié.**

Raisons vérifiées dans le code :

1. Auth nettement supérieure (révocation de session effective immédiatement, suspension d'un compte prise en compte à la requête suivante ; Food fait confiance au rôle du JWT jusqu'à expiration).
2. Le chat Glotta couvre déjà texte, vocal, image, réactions, réponses, accusés lus/délivrés, épinglage, recherche, pagination par curseur, anti-doublon `clientId`. Le chat Food est une room unique par commande où client, restaurant **et livreur voient tout** — incompatible avec l'exigence « client↔restaurant » et « client↔livreur » séparés.
3. Infrastructure de tests et de garde-fous (rate-limit HTTP + socket, validation de config au démarrage) déjà écrite.
4. Le domaine Food est petit (~10k lignes) et comporte des défauts à corriger de toute façon (§4).

Alternative écartée : partir de Food et y porter le chat — cela reviendrait à réécrire ~20k lignes de messagerie sécurisée.

## 3. Inventaire Glotta

**Conserver tel quel ou presque** : `auth` (sans 2FA/QR), `users`, `profiles`, `conversations`, `messages`, `presence`, `notifications`, `push`, `uploads`, `reports` → `ModerationReport`, `admin`, `maintenance`, `config/startup-validation`, `common`.

**À adapter** (détails §5–§8) :
- `conversations` : ajouter le lien à une commande et un `kind` ; **court-circuiter `whoCanMessageMe`/contacts** pour les conversations liées à une commande ou au support ; interdire au client de créer lui-même une conversation arbitraire.
- `presence` : `Map` mémoire → Redis.
- `notifications` : ajouter les types commande/livraison/avis/promo.
- `voice` : garder l'enregistrement/lecture des vocaux, **retirer le pipeline de traduction**.

**Ne pas monter dans `AppModule`** (hors périmètre MVP, section 65 du cahier des charges) : `calls`, `group-calls`, `translations`, `languages`, `statuses`, `stickers`, `contacts`, `device-link`, `two-factor`. Le code reste dans le dépôt d'origine (`../chat`) ; il n'est pas copié dans le projet unifié. Rien n'est supprimé.

**OTP SMS** : conservé et désactivé par défaut (`REGISTRATION_OTP_ENABLED=false`), car le téléphone est l'identifiant naturel au Togo. Il s'activera avec un vrai fournisseur SMS sans modification de code.

## 4. Inventaire Food — à réécrire, pas à reporter

Défauts **confirmés à la lecture** :

| # | Défaut | Où |
|---|---|---|
| 1 | Le prix de livraison n'est jamais ajouté à `totalAmount` à la création | `orders.service.ts` `create` |
| 2 | Code promo consommé **avant** la transaction : un échec ensuite « brûle » l'usage | `orders.service.ts:107` |
| 3 | Contrôle de stock hors transaction (course entre deux commandes) | `orders.service.ts:71-88` |
| 4 | Rôle lu dans le JWT, jamais en base | `jwt.guard.ts`, `chat.gateway.ts` |
| 5 | Le client peut émettre `update_location` sur une commande (usurpation de position livreur) ; coordonnées non validées ; le livreur n'est pas dans `assertParticipant` | `location.gateway.ts` |
| 6 | Le chat accepte `audioUrl`/`imageUrl` fournis par le client (URL arbitraire) | `chat.gateway.ts` |
| 7 | `userSockets` en `Map` mémoire, non scalable, écrasée à la 2ᵉ connexion | `chat.gateway.ts` |
| 8 | Montants en `Float` | `schema.prisma` |
| 9 | `PaymentMethod` = CARD/PAYPAL, sans rapport avec le contexte togolais ; aucun modèle de paiement réel | `schema.prisma` |
| 10 | Pas de panier serveur, pas d'options/variations de plat, catégorie de plat = `String` libre, un seul restaurant par propriétaire | `schema.prisma` |
| 11 | Statuts `ASSIGNED`, `ON_THE_WAY`, `REJECTED` absents ; le passage à `PICKED_UP`/`DELIVERED` est fait hors de `orders.service` (deux endroits écrivent le statut) | `orders.service.ts`, `delivery.service.ts` |
| 12 | `findOne` refuse l'accès au livreur et à l'admin | `orders.service.ts:241` |

**À conserver comme logique métier** (bien conçu) : offres de livraison par rounds avec expiration et rayon croissant (`startMatching`/`dispatchNextRound`), codes de retrait et de livraison anti-fraude, validation KYC restaurant/livreur, `PromoCode` (types, plafonds, restaurant ciblé), un avis par commande, snapshots de prix dans `OrderItem`, `Address` avec géoposition.

## 5. Conflits de modèles et résolution

| Sujet | Glotta | Food | Décision |
|---|---|---|---|
| `User` | `username` unique, `firstName/lastName`, `email?`, `phone?`, rôle `USER/ADMIN` | `name`, `email` requis, 4 rôles | Base Glotta. `Role` = `CLIENT, RESTAURANT, LIVREUR, ADMIN`. `username` généré automatiquement (mécanique déjà présente). Téléphone obligatoire à l'inscription, email optionnel |
| Rôle à l'inscription | — | auto-attribué (`CLIENT/RESTAURANT/LIVREUR`) | Le client envoie un `accountType` ; le **backend** fixe le rôle et crée un profil `PENDING`. Restaurant/livreur n'ont aucun droit opérationnel avant approbation admin (guard dédié). `ADMIN` jamais auto-attribuable |
| Session/refresh | `UserSession` | `RefreshToken` | Glotta. `RefreshToken` de Food abandonné |
| Tokens email/reset | `PasswordResetToken`, `EmailVerification` | `VerificationToken` | Glotta |
| `Notification` | `payload Json` + enum | `title/body/data` + enum | Modèle Glotta, enum étendu (`ORDER_*`, `DELIVERY_*`, `REVIEW`, `PROMO`) |
| Messages | `Message` (riche) | `ChatMessage` (par commande) | `Message` de Glotta. `ChatMessage` abandonné |
| Montants | — | `Float` | **`Int` (FCFA)** partout : le XOF n'a pas de sous-unité |
| Préfixe d'API | `/api` | `/api/v1` | **`/api/v1`** (versionné, prêt pour un futur mobile natif) |
| Hash mdp | `bcrypt` | `bcryptjs` | `bcrypt`, coût 12 |
| Migrations | 26 migrations Glotta | 8 migrations Food | **Nouvelle migration `init` unique** : aucune donnée de production à préserver, et l'historique des deux projets n'a pas de sens ensemble |

## 6. Modèle de données cible

Légende : **G** = repris de Glotta, **F** = repris/adapté de Food, **N** = nouveau.

- **Identité** : `User` (G, rôle étendu), `UserSession` (G), `PasswordResetToken` (G), `EmailVerification` (G), `OtpRequest` (G), `Profile` (G, sans champs traduction/clonage vocal), `PushSubscription` (G).
- **Restaurants** : `Restaurant` (F : `status` `PENDING→IN_REVIEW→APPROVED/SUSPENDED` au lieu de `isActive`, `slug`, logo, couverture, frais de livraison, minimum de commande, délai min/max), `RestaurantMember` (N : `OWNER|STAFF`, remplace `ownerId @unique`), `RestaurantCategory` (N : cuisines Poulet/Riz/Burger…, N-N), `RestaurantHours` + `RestaurantClosure` (N : horaires par jour + fermetures exceptionnelles ; « ouvert/fermé » **calculé côté serveur**, fuseau Africa/Lome).
- **Menu** : `MenuCategory` (N), `MenuItem` (F, prix `Int`, `categoryId`), `MenuItemOptionGroup` + `MenuItemOption` (N : min/max de sélection, variation de prix).
- **Client** : `Address` (F), `Cart` + `CartItem` (N, serveur, un restaurant à la fois, options en snapshot), `Favorite` (F, restaurants au MVP), `Review` (F, un avis par commande livrée, lié à `orderId`).
- **Commande** : `Order` (F : `orderNumber` séquentiel pour « #1842 », sous-total/livraison/remise/total en `Int`, snapshot d'adresse, 10 statuts du cahier des charges), `OrderItem` (F, nom + prix + options en snapshot), `PromoCode` (F + `startsAt`), `PromoRedemption` (N, unique `(promoCodeId, userId?, orderId)` : usage idempotent).
- **Livraison** : `DriverProfile` (F `DeliveryProfile`), `Delivery` (F), `DeliveryOffer` (F). **Position GPS : Redis uniquement** (voir §9), plus de `latitude/longitude` persistés sur le profil.
- **Paiement** : `Payment` (N : `orderId`, `provider`, `method`, `amount`, `currency=XOF`, `status`, `providerRef`, `metadata`), `PaymentTransaction` (N : journal des événements fournisseur, unique `(provider, providerEventId)` = webhook idempotent).
- **Chat** : `Conversation` (G + `kind` `ORDER_RESTAURANT|ORDER_DELIVERY|SUPPORT|DIRECT`, `orderId?`, `closedAt?`, unique `(orderId, kind)`), `ConversationMember` (G), `Message`, `Attachment`, `VoiceMessage`, `Reaction`, `MessageRead`, `LocationMessage` (G).
- **Transverse** : `Notification` (G), `AuditLog` (N), `ModerationReport` (G `Report`, cibles étendues à `ORDER`, `REVIEW`, `RESTAURANT`), `Announcement` (F, reporté à la Phase 12).
- **`Presence` : pas de table.** Décision héritée de Glotta et conservée : le « en ligne » vit dans Redis (TTL) ; seul `User.lastSeenAt` est écrit. Persister l'état en ligne afficherait des utilisateurs fantômes après un crash.
- **Abandonnés** : `PaymentMethod` (CARD/PAYPAL), `ChatMessage`, `RefreshToken`, `VerificationToken`, `DishReview` (hors périmètre MVP).

## 7. Chat : conversations et permissions

Les conversations liées à une commande sont **créées uniquement par le serveur**, jamais par un client.

| Conversation | Créée quand | Membres | Fermée |
|---|---|---|---|
| `ORDER_RESTAURANT` | Création de la commande | client + membres du restaurant | 24 h après livraison/annulation → lecture seule |
| `ORDER_DELIVERY` | Un livreur accepte la livraison | client + livreur | idem |
| `ORDER_DELIVERY` (2ᵉ) restaurant↔livreur | Un livreur accepte | restaurant + livreur | idem |
| `SUPPORT` | À la demande d'un utilisateur | utilisateur + agents admin | par un admin |

- Le client ne peut pas écrire au livreur tant qu'aucun livreur n'est associé : la conversation n'existe pas encore.
- Lecture/écriture : uniquement les membres (règle Glotta déjà en place) + admin/support pour `SUPPORT` et modération auditée dans `AuditLog`.
- Un membre du restaurant ajouté/retiré met à jour `ConversationMember`.
- Les pièces jointes sont référencées par **id d'`Attachment` téléversé**, jamais par URL fournie par le client (corrige le défaut #6).
- Notification de nouveau message supprimée si la conversation est ouverte (mécanique Glotta conservée, désormais lue depuis Redis).

## 8. Machine à états

**Un seul service écrit `Order.status`** : `OrderStateMachine`. Aucun endpoint n'accepte un statut arbitraire ; chaque endpoint correspond à **une action nommée** vérifiant l'acteur.

```
PENDING   → ACCEPTED   (restaurant)      → REJECTED (restaurant)   → CANCELLED (client)
ACCEPTED  → PREPARING  (restaurant)      → CANCELLED (client, restaurant, admin)
PREPARING → READY      (restaurant)
READY     → ASSIGNED   (système : un livreur a accepté)     [retrait sur place : → DELIVERED par le restaurant, avec code]
ASSIGNED  → PICKED_UP  (livreur + code de retrait)
PICKED_UP → ON_THE_WAY (livreur)
ON_THE_WAY→ DELIVERED  (livreur + code de livraison)
```

`Delivery` garde son propre statut (`SEARCHING`, `ASSIGNED`, `NO_DRIVER_FOUND`, …). La recherche de livreur **démarre dès `PREPARING`** (comportement Food, meilleur délai). Si un livreur accepte avant `READY`, `Order.status` passe à `ASSIGNED` au moment où la commande devient `READY`. *Point signalé : le cahier des charges décrit la recherche après `READY` ; je recommande de garder le démarrage anticipé.*

## 9. Temps réel, Redis, position GPS

- Un seul gateway Socket.IO (modèle Glotta : room `user:<id>`, on émet toujours vers des utilisateurs, jamais vers une room que le client prétend avoir rejointe). Événements en `domaine:action` (`message:new`, `order:accepted`, `delivery:location`, `notification:new`, …), compatibles avec la liste du cahier des charges.
- **Adaptateur Redis** (`@socket.io/redis-adapter`) : plusieurs instances Render possibles.
- **Présence** : `SET presence:<userId>` de socketIds avec TTL + heartbeat ; conversation ouverte : `open:<socketId>`.
- **Position livreur** : `GEOADD` + TTL court, écrite uniquement pendant qu'il est « disponible » (pour l'appariement) ou en livraison ; diffusée au client de **sa** commande via `delivery:location` ; jamais historisée en base. Seul le livreur assigné peut émettre, coordonnées validées (corrige le défaut #5).
- Rate limiting HTTP : `ThrottlerStorage` Redis. Rate limiting socket : `SocketRateLimiter` Glotta conservé.
- **Dégradation** : sans `REDIS_URL` en développement/test, repli mémoire (log d'avertissement) ; en production le démarrage échoue sans Redis.

## 10. Paiement

```
PaymentProvider { initiate(order) · verifyWebhook(req) · parseEvent(req) · status(ref) }
   ├─ CashOnDeliveryProvider   (réel, MVP)
   ├─ SandboxMobileMoneyProvider (dev/test uniquement, nommé explicitement, refuse de démarrer en production)
   └─ TMoney / Flooz            (adaptateurs à brancher — voir limite ci-dessous)
```

- `Order.paymentStatus` n'est **jamais** modifié par une requête du frontend : uniquement par le webhook vérifié (signature `PAYMENT_WEBHOOK_SECRET`, idempotence via `PaymentTransaction`) ou, pour le paiement à la livraison, par la confirmation du livreur.
- Une commande payée en ligne n'est visible du restaurant qu'une fois `PAID`. Le paiement à la livraison est visible immédiatement.
- **Limite** : je ne peux pas écrire un adaptateur TMoney (Togocom) ou Flooz (Moov) réel sans la documentation d'API et des identifiants de test. Deux voies : un agrégateur couvrant le Togo (à confirmer : PayGate Global, CinetPay, FedaPay) ou une intégration directe. Le MVP tourne de bout en bout avec cash + sandbox ; l'adaptateur réel se branche ensuite derrière la même interface.

## 11. Architecture backend

```
backend/src/
  auth/ users/ profiles/          (Glotta)
  restaurants/ menu/ categories/  (Food réécrit)
  carts/ orders/ (+ order-state-machine)
  deliveries/ drivers/            (Food réécrit, position → Redis)
  payments/ (providers/ + webhook)
  chat/ ← conversations + messages Glotta (un seul système)
  notifications/ push/            (Glotta)
  reviews/ favorites/ promo-codes/ addresses/
  uploads/                        (Glotta Cloudinary + validation signature)
  admin/ reports/ audit/
  redis/ websocket/ presence/ common/ config/
```

Un seul module par domaine ; aucun doublon.

## 12. Frontend

Quatre applications Next.js indépendantes (App Router, TypeScript, Tailwind 4, TanStack Query, Zustand, Axios, Socket.IO client) — `client/` (3000), `restaurant/` (3001), `livreur/` (3002), `admin/` (3003) — qui relaient `/api/v1/*` vers l'unique backend (cookies httpOnly « same-site », jeton court pour le WebSocket). Le rôle est toujours celui du serveur ; chaque app refuse les autres rôles. Responsive : navigation basse sur téléphone, barre latérale dès la tablette. Cartes : OpenStreetMap intégrée (aucune clé). QR de remise généré dans le navigateur (le code ne quitte jamais l'appareil). `start-all.sh` relance tout en local.

PWA : manifest « Riiberaka », service worker avec cache **des seuls assets statiques et des listes de restaurants/menus** (stale-while-revalidate) ; commandes, paiements, statuts et chat toujours en `network-only`.

## 13. Déploiement

Procédure complète : `DEPLOYMENT.md` ; blueprint Render : `render.yaml`.

Vercel (frontend) · Render (backend, sans Docker : `nest build` + `prisma migrate deploy`) · Neon (`DATABASE_URL` poolée pour le runtime + `DIRECT_URL` pour `prisma migrate` ; `prisma.config.ts` utilise `DIRECT_URL` quand elle est définie) · Redis managé (Upstash ou Render Key Value). Les vocaux : Glotta les garde en stockage local (disque éphémère sur Render) — **à remplacer par Cloudinary `resource_type: raw/video` en accès authentifié** dès la Phase 9, sinon les vocaux disparaissent à chaque redéploiement.

Variables : celles du cahier des charges + `CORS_ORIGIN`, `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (deux secrets distincts, validés au démarrage), `VAPID_*`, `SMS_PROVIDER`, `MAIL_PROVIDER`.

## 14. Sécurité — constats à traiter dès la Phase 2

- `backend/.env` existe et `backend/.env.example` contient des secrets JWT réels d'apparence (valeurs « de dev » de 64 hex). Le nouveau projet aura des `.env.example` **avec placeholders** et un `.gitignore` strict ; ne pas réutiliser ces valeurs.
- Le dépôt n'est pas sous git : aucun retour arrière possible. Voir décision 3.

## 15. Plan

| Phase | Contenu | Livrable vérifiable |
|---|---|---|
| 2 | Squelette unifié, `User`/rôles/approbation, migration `init`, auth Glotta + `accountType`, Redis, `/api/v1`, Swagger | tests auth + rôles verts, inscription des 4 rôles |
| 3 | Restaurants, horaires, menu, options, KYC/approbation | un restaurant approuvé avec menu servi par l'API |
| 4–5 | Frontend client PWA, panier serveur | parcours accueil → panier réel |
| 6–7 | Commandes + machine à états, dashboard restaurant temps réel | commande créée → acceptée → prête |
| 8 | Livraison, matching, tracking | livreur assigné, position en direct |
| 9–10 | Chat par commande, notifications, Web Push | conversation client↔resto↔livreur |
| 11 | Paiements (cash + sandbox + webhook) | webhook idempotent testé |
| 12–13 | Promos, avis, favoris, admin | — |
| 14–15 | PWA/push finalisés, tests e2e, sécurité, perf | parcours complet e2e |

## 16. Décisions demandées (défauts recommandés)

1. **Emplacement** : convertir `riibo/backend` **en place** en backend unifié, laisser `Backend-main/` intact comme référence en lecture seule jusqu'à la fin de la Phase 12, créer `riibo/frontend/`. *(recommandé)*
2. **Identifiant** : téléphone obligatoire + email optionnel, OTP SMS désactivé tant qu'aucun fournisseur SMS n'est choisi. *(recommandé)*
3. **Git** : `git init` + un commit de base avant toute modification, pour rendre chaque phase relisible et réversible. *(recommandé — je ne commite que sur votre accord)*
4. **Livreur pendant `PREPARING`** : garder la recherche anticipée (§8). *(recommandé)*
5. **Paiement réel** : quel agrégateur ou opérateur visez-vous pour TMoney/Flooz ? Non bloquant jusqu'à la Phase 11.
