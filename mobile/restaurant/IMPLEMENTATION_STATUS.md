# Riiberaka Restaurant — état d'implémentation

Audit et développement du 2026-10-18. Une fonctionnalité n'est « vérifiée »
que si elle a été exécutée contre le vrai backend ou sur un appareil.

## 1. Audit

### Dépôt
- Aucun projet Flutter restaurant antérieur. Projet créé : `mobile/restaurant`
  (Flutter 3.44.6, Dart 3.12.2, `com.riiberaka.restaurant`).
- Socle partagé : `mobile/packages/riiberaka_core` (réseau, session, stockage
  sécurisé, thème, composants, temps réel, messagerie, notifications), déjà
  utilisé par le client et le livreur. **Non modifié** pour ce travail.
- Téléphone (Galaxy S9) **débranché** : vérifications faites sur l'ordinateur
  contre le backend local (port 4100, base de démonstration).

### Backend — routes restaurant (préfixe `/api/v1`, compte démo `+22890200001`)

| Fonction | Route | Règle serveur |
|---|---|---|
| Restaurants du compte | `GET /users/me` → `restaurants[]` (`memberRole` OWNER/STAFF) | rôle relu en base |
| Fiche | `GET/PATCH /restaurant/:id` | STAFF ne modifie que `isPaused` |
| Horaires | `PUT /restaurant/:id/hours {ranges}` | remplace toute la semaine |
| Fermetures exceptionnelles | `POST/DELETE /restaurant/:id/closures[/:closureId]` | |
| Logo / couverture | `POST /restaurant/:id/images/:kind` (champ `image`, 8 Mo) | format réel vérifié |
| Tableau de bord | `GET /restaurant/:id/dashboard` | chiffres du jour |
| Commandes | `GET /restaurant/:id/orders?scope=active\|past&cursor&limit` | **limit ≤ 50** |
| Détail | `GET /orders/:id` | membre du restaurant uniquement |
| Transitions | `POST /restaurant/:id/orders/:orderId/{accept,reject,start-preparing,ready,hand-over,cancel}` | machine à états serveur ; motif 3–300 car. pour `reject`/`cancel` |
| Relance livreur | `POST /restaurant/:id/orders/:orderId/retry-delivery` | |
| Menu | `GET /restaurant/:id/menu` ; `POST/PATCH/DELETE …/menu/categories`, `…/menu/items` | |
| Photo de plat | `POST …/menu/items/:itemId/image` | |
| Options | `PUT …/menu/items/:itemId/options {groups}` | remplace tous les groupes |
| Avis | `GET /restaurant/:id/reviews`, `POST …/reviews/:reviewId/reply` | |

Garde d'accès (`RestaurantAccessGuard`) : un restaurant dont l'utilisateur
n'est pas membre répond **404** (pas d'indice d'existence). Les commandes
exigent un restaurant **APPROUVÉ** (`RestaurantOperational`).

### Constats (backend)
1. **Pas de commission ni de règlement au restaurant** : le tableau de bord
   donne `revenue` = sous-total − remises des commandes livrées du jour.
   L'app l'appelle « ventes livrées », jamais « revenus » ou « à percevoir ».
2. **Promotions** : gérées uniquement par l'admin ; aucune route restaurant.
3. Pas de temps de préparation **par commande** (seulement `prepTimeMin/Max`
   de la fiche).
4. Catégories : ni description ni état actif/inactif côté API.
5. Statistiques limitées au jour courant (pas de période).
6. Push natif non configuré (Firebase absent) : notifications in-app,
   temps réel, son et vibration quand l'app est ouverte.

## 2. Implémentation

| Phase | État | Détails |
|---|---|---|
| Initialisation | ✅ | Riverpod, go_router (4 onglets), socle partagé, thème clair/sombre, config `--dart-define` |
| Authentification | ✅ code + tests | compte existant (numéro + code) ; rôle ≠ RESTAURANT → session révoquée ; restaurant non validé expliqué |
| Commandes temps réel | ✅ **vérifié en réel** | onglets Nouvelles / En cuisine / Prêtes / En livraison ; son + vibration à chaque nouvelle commande (pas au premier chargement) ; anti double appui ; « déjà traitée » expliqué |
| Accepter / refuser | ✅ vérifié en réel | refus et annulation : confirmation + motif obligatoire |
| Préparation / prête / remise | ✅ vérifié en réel | à emporter : remise par le restaurant ; livraison : remise au livreur (code de retrait), pas de bouton |
| Menu | ✅ code + tests | catégories, plats, prix, stock, quantité max, disponibilité, photo avec progression, groupes d'options |
| Disponibilité / pause | ✅ code + tests | état affiché = état serveur ; STAFF : pause seulement |
| Horaires / fermetures | ✅ code ; horaires vérifiés en réel | plages par jour, fermetures datées avec motif |
| Promotions | ⛔ non applicable | admin uniquement (constat 2) |
| Statistiques / historique | 🟡 | chiffres réels du jour ; historique paginé ; pas de période (constat 5) |
| Avis | ✅ code | lecture + réponse |
| Notifications / chat / assistance | ✅ code | liste in-app, chat de commande existant, assistance |
| Isolation inter-restaurants | ✅ **vérifiée en réel** | tableau de bord, commandes, menu, modification d'un autre restaurant → 404 |
| Finition | 🟡 | analyse 0 problème ; APK debug compilé ✅ ; essai sur téléphone **en attente** |

## 3. Tests exécutés

- `flutter analyze` : 0 problème.
- `flutter test` : **14/14** — actions par état (miroir de
  `order-transitions.ts`), motif obligatoire, colonnes, lecture des réponses
  réelles, signal sonore unique, restaurant non validé, double appui,
  refus sans motif bloqué, conflit 409, disponibilité d'un plat, pause,
  droits STAFF, validation du formulaire plat. Le faux dépôt applique la
  même limite `limit ≤ 50` que le serveur.
- `flutter test test_real_backend --dart-define=API_BASE_URL=http://localhost:4100`
  : **2/2** contre le vrai backend :
  1. un client commande à emporter ; dans l'app : Accepter → Lancer la
     préparation → Prête → Remise ; le serveur confirme ACCEPTED, PREPARING,
     READY, DELIVERED ;
  2. isolation (404 sur un autre restaurant).

  Le test élargit temporairement les horaires du jour (tests de nuit), puis
  les **restaure à l'identique** (comparaison avant/après) et clôt sa propre
  commande si elle reste ouverte.
- `flutter build apk --debug` : ✅ (`build/app/outputs/flutter-apk/app-debug.apk`).
- Captures : `flutter test test_screenshots --update-goldens --dart-define=SHOTS_DIR=…`.

### Bug trouvé par le test réel
Liste des commandes demandée avec `limit=100` → 400 « limit must not be
greater than 50 ». Corrigé (50) et reproduit dans le faux dépôt.

### Données de démonstration touchées
Commandes de test #20 à #26 (créées par les essais) : refusées avec le motif
« Commande de test automatisé » (#20–#22) ou remises (#23–#26). Aucune
autre commande modifiée. Les commandes remises comptent dans les « ventes
livrées » du jour de la base de démonstration.

## 4. Modifications backend

Aucune. Propositions (à valider avant toute modification) :
- Commission et règlements restaurant (montant net, versements).
- Statistiques par période.
- Temps de préparation estimé par commande.
- Description et état actif des catégories.
- Promotions gérées par le restaurant (si souhaité).
- Configuration Firebase pour les notifications push.
