# Riiberaka Livreur — état d'implémentation

Audit et développement du 2026-10-17. Une fonctionnalité n'est « vérifiée »
que si elle a été exécutée contre le vrai backend ou sur un appareil.

## 1. Audit

### Dépôt
- Pas de dépôt Git. Le dossier web `livreur/` (Next.js) n'existe plus ; aucun
  projet Flutter livreur antérieur. Projet créé : `mobile/livreur`
  (Flutter 3.44.6, Dart 3.12.2, `com.riiberaka.livreur`).
- Socle partagé avec l'app client : `mobile/packages/riiberaka_core` (réseau,
  session, stockage sécurisé, thème, composants, temps réel, messagerie,
  notifications). Extraction vérifiée : client 82/82 tests.
- Outils : SDK Android 36 ; aucun émulateur ; téléphone Samsung Galaxy S9
  (Android 10) utilisé pour l'app client, **débranché pendant ce travail**.

### Backend — routes livreur (vérifiées en réel, compte de démo `+22890300001`)

| Fonction | Route | Règle serveur |
|---|---|---|
| Profil + chiffres du jour | `GET /driver/me` | rôle LIVREUR |
| Modifier véhicule / Mobile Money | `PATCH /driver/me` | |
| Pièces du dossier | `POST /driver/me/documents/:type`, `POST /driver/me/submit` | non intégrés (voir limites) |
| En ligne / hors ligne | `PUT /driver/me/availability {online}` | compte APPROUVÉ ; hors ligne refusé (409) pendant une course |
| Position | `POST /driver/location {latitude, longitude}` | APPROUVÉ et EN LIGNE ; Redis, TTL 90 s ; 40/min |
| Offres | `GET /driver/offers` | offres non expirées (30 s) ; pas d'adresse client avant acceptation |
| Accepter / refuser | `POST /driver/offers/:deliveryId/accept`, `/reject` | acceptation atomique ; 409 si déjà prise ou expirée |
| Course en cours | `GET /driver/deliveries/current` → `{ delivery }` | |
| Au restaurant | `POST /driver/deliveries/:id/at-restaurant` | depuis ASSIGNED |
| Retrait | `POST /driver/deliveries/:id/pick-up {code}` | code du restaurant ; commande prête (`Order.status = ASSIGNED`) |
| Arrivé | `POST /driver/deliveries/:id/arrived` | prévient le client |
| Remise | `POST /driver/deliveries/:id/deliver {code}` | code du client |
| Désistement | `POST /driver/deliveries/:id/release {reason?}` | seulement avant le retrait |
| Historique | `GET /driver/deliveries?cursor&limit` | courses livrées/annulées, curseur |

Codes : 6 chiffres, comparaison à temps constant, 5 échecs → blocage 15 min
(429). Le livreur ne voit jamais les codes.

Compte non approuvé (`+22890777001`, IN_REVIEW) : `PUT availability` → 403
« Votre compte livreur n'est pas encore validé. » ✅ vérifié.

### Dispatch (dispatch.service.ts)
Toutes les 10 s ; 3 livreurs par tour ; rayons 3 → 5 → 8 → 12 km ; offre de
30 s ; un livreur n'est candidat que s'il est APPROUVÉ, EN LIGNE, LIBRE et a
envoyé une **position de moins de 90 s** → l'app envoie sa position tant que
le livreur est en ligne, pas seulement pendant une course.

### Temps réel
`delivery:offer`, `delivery:offer-expired`, `order:*`, `notification:new`,
`message:new` ; jeton court `POST /auth/socket-token` à chaque connexion.

### Constats importants (backend)
1. **Aucune rémunération du livreur n'existe.** `GET /driver/me` renvoie
   `today.earnings` = somme de `Delivery.deliveryFee`, qui est une copie des
   **frais de livraison payés par le client**. Pas de commission, de prime, de
   versement ni de portefeuille. L'app affiche donc « frais de livraison des
   courses », jamais « vos gains ».
2. **Pas d'échec de livraison après retrait** : si le client est absent ou
   refuse, aucune route ne permet de clore la course. L'app propose le
   signalement (`POST /reports`) et l'assistance ; la course reste ouverte
   jusqu'à traitement par l'équipe (admin).
3. Pas de route « dossier livreur » côté app pour devenir livreur : les
   comptes créés par OTP sont toujours CLIENT (sécurité correcte). Inscription
   livreur : `POST /auth/register` (mot de passe) + validation admin.
4. Historique sans filtre de dates ni totaux par période.
5. Pas de suivi de l'encaissement des espèces (montant à remettre au
   restaurant / à Riiberaka).

## 2. Implémentation

| Phase | État | Détails |
|---|---|---|
| 2 Initialisation | ✅ | Riverpod (déjà éprouvé côté client), go_router, socle partagé, thème clair/sombre, config `--dart-define` |
| 3 Authentification | ✅ code + tests | numéro + code SMS sur compte existant (`login/request-otp`, sans révéler si le numéro existe) ; rôle ≠ LIVREUR → session révoquée ; routes protégées |
| 4 Tableau de bord / disponibilité | ✅ code + tests | état affiché = état confirmé par le serveur ; position demandée avant ; compte non validé expliqué |
| 5 Propositions | ✅ code + tests | temps réel + relecture 20 s ; compte à rebours ; expirées retirées ; acceptation confirmée par le serveur ; « déjà prise » géré |
| 6 Collecte | ✅ code + tests | étapes réelles ; code de retrait vérifié serveur ; collecte bloquée tant que la commande n'est pas prête |
| 7 Livraison | ✅ code + tests | adresse, repère, appel, itinéraire, montant à encaisser, code de remise, signalements |
| 8 GPS | ✅ code ; ⚠️ arrière-plan non vérifié sur appareil | service de premier plan (notification), envoi ~12–30 s, arrêt si le serveur refuse |
| 9 Revenus / historique | 🟡 | historique paginé groupé par jour ; revenus réels **impossibles** (constat 1) |
| 10 Communication / notifications | ✅ code | chat existant (client et restaurant), notifications in-app ; push natif non configuré (Firebase) |
| 11 Profil / assistance | ✅ code | véhicule, Mobile Money, statut, assistance, urgence (117/118), déconnexion qui passe hors ligne et refuse pendant une course |
| 12 Finition | 🟡 | analyse 0 problème ; 14/14 tests ; APK debug compilé ✅ ; parcours réel sur téléphone **en attente** |

## 3. Tests exécutés

- `flutter analyze` : 0 problème.
- `flutter test` : **14/14** (modèles sur réponses réelles, disponibilité
  refusée sans GPS / refusée par le serveur / confirmée, suivi arrêté sur
  refus serveur, compte non validé, offre double appui et expirée, collecte
  bloquée avant « prête », montant à encaisser, code refusé par le serveur).
- `flutter build apk --debug` : ✅.
- Routes livreur appelées en réel avec curl (tableau §1) : ✅.
- `integration_test/delivery_flow_test.dart` (parcours complet réel : offre
  du vrai dispatch → retrait → remise → historique) : **écrit, non exécuté**
  (téléphone débranché ; bureau Linux inutilisable : stockage sécurisé).

## 4. Modifications backend

Aucune. Propositions (à valider avant toute modification) :
- Modèle de rémunération livreur (montant par course, primes, versements).
- Route de clôture « livraison échouée » avec motif, traitée par l'admin.
- Filtres de dates et totaux sur `GET /driver/deliveries`.
- Suivi de l'encaissement en espèces.
