# Audit backend pour Riiberaka Client (mobile)

Audit du 2026-10-17, fait sur le code de `backend/` et vérifié contre une
instance locale réelle (base `riiberaka`, données de démonstration).

## Résultats des tests backend

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires | `npm test` (backend) | 369/369 ✅ |
| e2e | `npm run test:e2e` (base `riiberaka_test` + Redis) | 239/239 ✅ |
| Schéma | `prisma migrate status` + `migrate diff` | à jour, aucun écart |

Préfixe de toutes les routes : `/api/v1`. Erreurs : `{ statusCode, message, timestamp }`
où `message` est une chaîne, un objet de validation (`{ message: string[] }`) ou un
objet métier (`{ code, message }`).

## Authentification mobile

Le backend prévoit déjà un client natif : **aucune modification nécessaire.**

- Jeton d'accès (15 min) dans `Authorization: Bearer …` (le cookie n'est qu'une
  alternative pour les PWA).
- Refresh token (30 j, rotation à chaque usage, fenêtre de grâce 5 s) envoyé dans
  le **corps** de `POST /auth/refresh` → `{ user, accessToken, refreshToken }`.
- Chaque requête revérifie la session en base (révocation immédiate) et relit le
  rôle en base.
- WebSocket : `POST /auth/socket-token` → `{ token, expiresIn: 120 }`, passé dans
  `auth.token` du handshake Socket.IO (jamais dans l'URL).

| Fonction | Route | Auth | Corps / réponse | Notes |
|---|---|---|---|---|
| Saisie du numéro | `POST /auth/otp/request` | — | `{ phone }` → `{ purpose: LOGIN \| REGISTER }` | 3/min/IP. Compte inactif → 401 |
| Connexion | `POST /auth/login/verify-otp` | — | `{ phone, code(6), deviceLabel? }` → `{ user, accessToken, refreshToken }` | 10/min. Code faux/expiré → 401 |
| Inscription | `POST /auth/register/verify-otp` | — | `{ phone, code?, firstName?, lastName?, deviceLabel? }` → idem | Rôle CLIENT imposé par le serveur. `code` exigé si `REGISTRATION_OTP_ENABLED=true` (production). Numéro pris → 409 |
| Mot de passe (outillage) | `POST /auth/login` | — | `{ identifier, password }` | Comptes de démo ; pas utilisé par l'app |
| Renouvellement | `POST /auth/refresh` | — | `{ refreshToken }` | 401 = session terminée |
| Déconnexion | `POST /auth/logout` | Bearer | 204 | Révoque la session et ses abonnements push |
| Profil | `GET /users/me` | Bearer | utilisateur + `profile` | |
| Modifier le profil | `PATCH /users/me` | Bearer | `{ firstName?, lastName?, username?, email? }` | Téléphone : jamais ici |
| Changer de numéro | `POST /auth/phone/request-change` puis `/auth/phone/verify-change` | Bearer | OTP | |
| Appareils | `GET /auth/sessions`, `DELETE /auth/sessions/:id` | Bearer | | |

En développement (`SMS_PROVIDER=none`), le code OTP est écrit dans le journal du
backend ; `REGISTRATION_OTP_ENABLED=false` laisse s'inscrire sans code.

## Catalogue (public, sans compte)

| Fonction | Route | Paramètres | Réponse |
|---|---|---|---|
| Catégories | `GET /restaurant-categories` | — | `[{ id, slug, name, icon }]` (icône = emoji, remplacée par une icône côté app) |
| Restaurants | `GET /restaurants` | `q` (nom), `category` (slug), `openNow`, `lat`+`lng`, `radiusKm` (≤50, défaut 20), `sort` = `nearest\|rating\|popular`, `page`, `limit` ≤ 30 | `{ items: RestaurantCard[], page, limit, total, hasMore }` ; ouverts d'abord |
| Détail restaurant | `GET /restaurants/:idOrSlug` | `lat`, `lng` | carte + `address, phone, latitude, longitude, hours[], upcomingClosures[]` ; 404 si non approuvé |
| Menu | `GET /restaurants/:idOrSlug/menu` | — | `{ categories: [{ id, name, items[] }], uncategorized[] }` ; plat : `id, name, description, price, imageUrl, isAvailable, maxQuantity, optionGroups[{ id, name, minSelect, maxSelect, options[{ id, name, priceDelta, isAvailable }] }]` |
| Plats (accueil/recherche) | `GET /menu-items` | `q` (plat ou restaurant), `category`, `page`, `limit` ≤ 30 | `{ items: [{ id, name, price, imageUrl, rating, reviewCount, hasOptions, restaurant{ id, slug, name, isOpen } }], … }` ; seulement les plats vendables |
| Avis | `GET /restaurants/:idOrSlug/reviews` | `cursor`, `limit` | liste paginée |

`RestaurantCard` : `id, slug, name, description, logoUrl, coverUrl, city, quarter,
categories[], rating, reviewCount, deliveryFee, minOrderAmount, prepTimeMin,
prepTimeMax, distanceKm, isOpen, closedReason, closesAt`.

**Absent du backend** (donc absent de l'app) : zone de livraison par restaurant
(frais fixes par restaurant), filtre par prix, filtre par note, frais variables
selon la distance, recherche par type de cuisine autre que les catégories.

## Client connecté (rôle CLIENT)

| Fonction | Route | Corps / paramètres | Notes |
|---|---|---|---|
| Panier | `GET /cart` | — | Toujours recalculé depuis la base : `items[].issue`, `blockers[]`, `canCheckout`, `subtotal`, `deliveryFee`, `discount`, `total`, `promo`, `promoIssue` |
| Ajouter | `POST /cart/items` | `{ menuItemId, quantity(1-50), optionIds?, note?(200), replaceCart? }` | 409 `CART_OTHER_RESTAURANT` si autre restaurant ; options validées serveur |
| Modifier | `PATCH /cart/items/:id` | `{ quantity?, optionIds?, note? }` | |
| Retirer / vider | `DELETE /cart/items/:id`, `DELETE /cart` | | |
| Code promo | `POST /cart/promo` `{ code }`, `DELETE /cart/promo` | | Revalidé à la commande |
| Adresses | `GET/POST /addresses`, `PATCH/DELETE /addresses/:id` | `{ label: MAISON\|TRAVAIL\|AUTRE, customLabel?, fullAddress, quarter?, landmark?, latitude?, longitude?, isDefault? }` | GPS facultatif |
| Commander | `POST /orders` | `{ deliveryType: DELIVERY\|PICKUP, addressId? \| address?+landmark?+lat/lng?, contactPhone?, paymentMethod, notes? }` | Construite depuis le panier serveur. **Seul `CASH_ON_DELIVERY` est accepté** (TMONEY/FLOOZ → 400). Anti-doublon : les lignes du panier sont consommées dans la transaction (2ᵉ envoi → 400 « panier vide » ou 409) |
| Mes commandes | `GET /orders` | `scope=active\|past`, `status`, `cursor`, `limit` ≤ 50 | `{ items, nextCursor }` |
| Détail | `GET /orders/:id` | — | Vue client : `deliveryTarget`, `delivery.deliveryCode` (code de remise), `conversations[]`, `review` |
| Annuler | `POST /orders/:id/cancel` | `{ reason? }` | Possible en `PENDING` ou `ACCEPTED` |
| Recommander | `POST /orders/:id/reorder` | — | Vide le panier puis réajoute ce qui est encore disponible, renvoie les articles écartés |
| Suivi | `GET /orders/:id/tracking` | — | `orderStatus, deliveryStatus, driver, driverLocation{ latitude, longitude, at }, etaMinutes, restaurant, destination` ; position seulement pendant une course active |
| Avis | `POST /orders/:orderId/review` | `{ rating 1-5, comment? }` | Un par commande livrée |
| Favoris | `GET /favorites`, `GET /favorites/ids`, `POST/DELETE /favorites/:restaurantId` | | Restaurants uniquement |
| Notifications | `GET /notifications` (`cursor`, `limit`), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | | |
| Push mobile | `POST /push/fcm/register` `{ token }`, `DELETE /push/fcm/register` | | Nécessite Firebase (voir plus bas) |
| Conversations | `GET /conversations`, `GET /conversations/:id`, `POST /conversations/support` | | Conversations de commande créées par le serveur uniquement |
| Messages | `GET /conversations/:id/messages`, `POST /messages` `{ conversationId, text, clientId? }`, `POST /conversations/:id/read` | | `clientId` = anti-doublon |
| Signalement | `POST /reports` | `{ targetType: ORDER\|…, targetId, reason(1-500) }` | Sert aux réclamations sur une commande |

**Absent du backend** : suppression de compte, préférences de notification par
type, paiement mobile (TMoney/Flooz/carte), réclamations typées (on utilise
`POST /reports` + conversation de support).

## Machine à états des commandes

`PENDING → ACCEPTED → PREPARING → READY → (ASSIGNED → PICKED_UP → ON_THE_WAY) → DELIVERED`
(le retrait sur place passe de `READY` à `DELIVERED`). Fins : `DELIVERED`,
`CANCELLED`, `REJECTED`. `ASSIGNED` peut revenir à `READY` si le livreur se désiste.
Livraison (`Delivery.status`) : `SEARCHING, ASSIGNED, AT_RESTAURANT, PICKED_UP,
ON_THE_WAY, ARRIVED, DELIVERED, NO_DRIVER_FOUND, CANCELLED`.

## Temps réel (Socket.IO, namespace par défaut)

Événements reçus par le client : `order:new`, `order:accepted`, `order:rejected`,
`order:preparing`, `order:ready`, `order:assigned`, `order:picked-up`,
`order:on-the-way`, `order:delivered`, `order:cancelled` (`{ orderId, orderNumber,
status }`), `delivery:location`, `delivery:at-restaurant`, `delivery:arrived`,
`delivery:no-driver`, `notification:new`, `message:new`, `message:updated`,
`message:deleted`, `conversation:new`, `session:revoked`.

## Notifications push mobiles

Le backend sait envoyer via FCM (`firebase-admin`) si `FIREBASE_SERVICE_ACCOUNT`
est défini ; l'app doit enregistrer son jeton FCM (`POST /push/fcm/register`).
Bloquant externe : projet Firebase, `google-services.json` (Android),
`GoogleService-Info.plist` (iOS) et compte de service côté backend.
