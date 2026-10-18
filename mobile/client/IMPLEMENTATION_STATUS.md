# Riiberaka Client — suivi d'implémentation

Une fonctionnalité n'est « terminée » que si son comportement est implémenté ET
vérifié au niveau indiqué. Les tests sont de trois natures, jamais confondues :

- **Unitaires / widgets** (`flutter test`) : sans serveur, avec des doublures.
- **Intégration réelle** (`integration_test/`) : application complète contre le
  vrai backend local, lancée sur le bureau Linux et sur un téléphone Android.
- **Vérification visuelle** : captures rendues par l'application elle-même
  (`SCREENSHOT_DIR`) ou capture de l'écran du téléphone (`adb screencap`).

## Phase 0 — Audit ✅

Voir [docs/API_AUDIT.md](docs/API_AUDIT.md). Backend : 369 tests unitaires et
239 e2e réussis le 2026-10-17 ; authentification mobile native déjà prévue
(Bearer + refresh dans le corps), aucune modification backend nécessaire.

## Phase 1 — Initialisation ✅

- Projet `mobile/client` (Flutter 3.44.6, Dart 3.12.2), Android + iOS (+ Linux
  pour la vérification sur poste). Identifiant `com.riiberaka.client`.
- Configuration par `--dart-define-from-file` ([lib/app/config/env.dart](lib/app/config/env.dart)) :
  HTTPS obligatoire en release, `10.0.2.2` par défaut sur émulateur en debug.
- Client HTTP ([lib/core/api/api_client.dart](lib/core/api/api_client.dart)) : Bearer,
  renouvellement de session unique et partagé, refus serveur ≠ panne réseau.
- Jetons dans le stockage sécurisé du système ([lib/core/auth/token_store.dart](lib/core/auth/token_store.dart)).
- HTTP en clair autorisé uniquement dans le manifeste debug.

Tests : `flutter analyze` (0 problème), `flutter test` (20/20),
`flutter build apk --debug` ✅, `flutter build linux --debug` ✅, intégration
Linux contre le backend réel ✅.

## Phase 2 — Système de design ✅

- Jetons : [lib/app/theme/tokens.dart](lib/app/theme/tokens.dart) ; thème clair/sombre :
  [lib/app/theme/app_theme.dart](lib/app/theme/app_theme.dart) (Nunito Sans embarquée, OFL).
- Composants : [lib/core/widgets/](lib/core/widgets/) — boutons (état de chargement
  anti double appui), cartes, étiquettes, note, sélecteur de quantité, bandeaux,
  états vides/erreur, squelettes, images réseau mises en cache, feuilles,
  confirmation.
- Navigation : 4 onglets à piles indépendantes ([lib/app/router/](lib/app/router/)).
- Catalogue visuel `/design` (debug uniquement).

Tests : analyse ✅, unitaires ✅, intégration **sur téléphone Samsung Galaxy S9
(Android 10)** ✅ 2/2 (onglets, bouton retour visible, retour système Android,
mode sombre, écran 320 × 640) ; captures vérifiées (clair, sombre, petit écran).

## Phase 3 — Accueil et découverte ✅

- Accueil ([lib/features/home/home_screen.dart](lib/features/home/home_screen.dart)) : lieu de
  livraison, accès recherche, catégories (filtre serveur), plats vendables
  maintenant (`GET /menu-items`), restaurants paginés avec filtres réels
  (« Ouverts maintenant », tri note/popularité, « plus proches » seulement avec
  une position), tirer pour rafraîchir, états chargement/vide/erreur.
- Lieu de livraison ([lib/features/location/](lib/features/location/)) : GPS facultatif,
  permission demandée au moment du choix, repli manuel (quartier), réglages
  si refus définitif ; coordonnées stockées localement à ~100 m près.
- Recherche ([lib/features/search/](lib/features/search/)) : délai de frappe 350 ms, plats
  ou restaurants, catégories, « Ouverts maintenant », recherches récentes
  locales.
- Absents car absents du backend : promotions publiques, filtres prix/note,
  zone de livraison.

Tests : 32/32 unitaires et widgets (modèles, requêtes, accueil, erreur hors
ligne puis réessai, vide, fermé, petit écran, recherche avec délai) ;
intégration réelle **sur le téléphone** 4/4 (navigation, accueil réel,
filtre, recherche « poulet », 320 px en sombre) ; vérification de l'écran
réel par `adb screencap` → défaut corrigé (filigrane du monogramme découpé).

## Phase 4 — Restaurants et menus ✅

- Fiche ([lib/features/restaurant/restaurant_screen.dart](lib/features/restaurant/restaurant_screen.dart)) :
  visuel, ouvert/fermé (motif serveur), préparation, frais, minimum, adresse
  et horaires (ISO, fermetures prévues), menu par sections avec raccourcis,
  plats indisponibles grisés, avis réels, ouverture directe d'un plat.
- Plat ([lib/features/restaurant/widgets/dish_sheet.dart](lib/features/restaurant/widgets/dish_sheet.dart)) :
  options à choix unique/multiple, règles min/max, options épuisées,
  précision (200 car.), quantité bornée (max du plat, 50), prix en direct.
  Règles calquées sur `resolveSelection` ([dish_selection.dart](lib/features/restaurant/dish_selection.dart)) ;
  le serveur recalcule toujours.

## Phase 5 — Panier ✅

- Panier serveur ([lib/features/cart/](lib/features/cart/)) : ajout (connexion à la demande,
  confirmation avant de remplacer le panier d'un autre restaurant), quantité,
  retrait, modification des options, code promo, blocages et problèmes de
  ligne venant du serveur, total estimé. Écritures en série ; valeur du
  serveur toujours retenue, panier relu après un échec.
- Persistance : côté serveur (lié au compte) — rien de sensible sur l'appareil.

Tests (phases 4–5) : 49/49 unitaires et widgets ; intégration réelle **sur le
téléphone** 2/2 : options du menu réel (3 000 F), connexion demandée au moment
de l'ajout, ajout réel (2 800 F calculés par le serveur), quantité 2 →
5 600 F recalculés, retrait → panier vide. Captures vérifiées ; titre en double
sur la fiche corrigé.

## Phase 6 — Authentification et adresses 🟡 presque terminée

- Connexion/inscription par téléphone + code SMS ([lib/features/auth/](lib/features/auth/)) :
  numéro local togolais ou international, renvoi du code après 60 s, comptes
  restaurant/livreur refusés (session révoquée aussitôt).
- Session ([lib/core/auth/session.dart](lib/core/auth/session.dart)) : restauration au
  démarrage (profil en cache pour un démarrage hors ligne), fin de session
  signalée, déconnexion qui efface toujours les jetons locaux.
- **Deux courses corrigées grâce aux tests réels** : un renouvellement de
  session ancien, terminé en retard, effaçait/écrasait les jetons d'une
  connexion plus récente ; et la lecture initiale du stockage pouvait
  réécrire des jetons plus récents. Tests de non-régression ajoutés.
- Adresses ([lib/features/addresses/](lib/features/addresses/)) : liste, création,
  modification, suppression, principale, quartier, repère, GPS facultatif.
- Compte ([lib/features/account/account_screen.dart](lib/features/account/account_screen.dart)).

Reste : test réel du parcours SMS complet sur le téléphone (bloqué sur le
poste Linux : le stockage sécurisé y plante faute de trousseau système).

## Phase 7 — Commande ✅

- Validation ([lib/features/checkout/](lib/features/checkout/)) : livraison ou à emporter,
  adresse, contact, précision, paiement (espèces à la livraison seul actif ;
  TMoney/Flooz affichés « Bientôt »), récapitulatif.
- Anti-doublon ([order_submission.dart](lib/features/checkout/order_submission.dart)) : un seul
  envoi ; réponse perdue → vérification des commandes en cours (en ignorant
  celles qui existaient avant l'envoi), jamais de renvoi automatique ; état
  « Vérifier ma commande » si la vérification est impossible.

## Phase 8 — Suivi et historique ✅

- Commandes en cours / passées, détail avec étapes réelles, motif de
  refus/annulation, code de remise, livreur, position avec son ancienneté
  (jamais présentée comme actuelle au-delà de 2 min), annulation (PENDING /
  ACCEPTED), « Commander à nouveau » (articles écartés expliqués), avis.
- Temps réel ([lib/core/realtime/realtime.dart](lib/core/realtime/realtime.dart)) : Socket.IO avec
  jeton court redemandé à chaque connexion, coupé en arrière-plan,
  resynchronisation au retour ; relecture périodique en filet de sécurité.
- Défaut corrigé : la réponse réelle de l'annulation est `{ id, status }`.

Tests (phases 6–8) : 76/76 unitaires et widgets. Intégration réelle **sur le
téléphone** : adresse via le formulaire → panier → commande réelle → le
restaurant de démo accepte via l'API → l'écran passe à « Acceptée » **sans
action, en temps réel** → annulation → « Commander à nouveau ». Défaut
d'affichage trouvé : clavier resté ouvert après « Enregistrer » (corrigé,
à revérifier sur le téléphone).

Incident : en nettoyant après un test interrompu, une commande de démonstration
PRÉEXISTANTE (`cmu9pfcg0000e64sdru7ezvnz`, base de développement) a été annulée
par erreur. Les nettoyages ne visent désormais que les commandes créées par
le test.

## Phase 9 — Favoris, notifications, profil 🟡 code et tests unitaires faits

- Favoris synchronisés avec le compte (cœur sur les cartes et la fiche,
  écran « Mes favoris »).
- Notifications : liste paginée, lecture, « Tout lire », badge non lues mis à
  jour en temps réel, ouverture de la commande concernée.
- Profil : prénom, nom, e-mail ; préférence réelle `notificationsEnabled`
  (le serveur coupe alors TOUTES les notifications — c'est dit à l'écran).
- Push sur le téléphone (FCM) : non branché, configuration Firebase absente.

## Phase 10 — Messagerie et assistance 🟡 code et tests unitaires faits

- Conversations de commande (restaurant, livreur) en texte, messages système
  d'avancement, temps réel, lecture seule une fois terminées, envoi
  anti-doublon (`clientId`, aucun doublon avec l'écho temps réel).
- Assistance : conversation de support (`POST /conversations/support`).
- « Signaler un problème » sur une commande (`POST /reports`, motifs : retard,
  article manquant, commande incorrecte, paiement, livraison, autre).
- Vocaux, médias, positions : non proposés (signalés comme tels s'ils arrivent).

Tests : 82/82 unitaires et widgets. **Reste à vérifier sur le téléphone**
(débranché pendant ces phases).

## Problèmes connus / limites

- Pas de paiement mobile côté backend : seul le paiement à la livraison sera
  proposé comme opérationnel.
- Pas de suppression de compte côté backend (non proposée dans l'app).
- Bureau Linux : le stockage sécurisé plante sans trousseau système ; les
  parcours connectés se vérifient donc sur le téléphone.
- Notifications push : configuration Firebase absente (voir docs/API_AUDIT.md).
- Bureau Linux (vérification seulement) : GTK 3 plante sous Wayland avec le
  schéma GNOME récent → lancer avec `GDK_BACKEND=x11`.
