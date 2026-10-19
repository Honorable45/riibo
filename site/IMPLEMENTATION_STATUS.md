# Riiberaka — site vitrine : état d’implémentation

Mis à jour le 2026-10-19. Une fonctionnalité n’est « vérifiée » que si elle a été
exécutée dans un vrai navigateur contre le backend local.

## 1. Audit (phase 1)

- Aucun site vitrine existant. Le dépôt contient `backend/` (NestJS),
  `admin/` (Next.js) et les applications Flutter `mobile/` (client,
  restaurant, livreur). Le site est créé dans `site/` (workspace npm, port 3004).
- Identité existante, reprise telle quelle : logo « R » avec cloche et traits
  de vitesse (`mobile/client/assets/images/logo_mark.png`, PNG 320 px, pas de
  SVG), bleu `#0058F0`, encre `#0A1633`, Nunito Sans, et la règle de la charte
  mobile : « la photo des plats apporte la chaleur, l’interface reste calme ».
- URL : aucun domaine de production, aucune application client web ni fiche
  de store n’existe dans le dépôt (l’app client est en Flutter, non publiée).
  Seuls `riiberaka-api.onrender.com` (DEPLOYMENT.md) et
  `contact@riiberaka.com` (paramètre technique `VAPID_SUBJECT`) apparaissent ;
  ils ne sont pas réutilisés sans confirmation. Tout passe par des variables.
- Endpoints publics utilisés : `GET /restaurants` (validés uniquement),
  `GET /menu-items` (plats, prix, image, restaurant ; `limit ≤ 30`). Les
  descriptions de plats ne sont pas exposées par cette route : les cartes n’en
  affichent donc pas.
- Candidature restaurant : l’inscription existante (`POST /auth/register`
  RESTAURANT) crée un compte avec mot de passe et code SMS, sans écran pour
  compléter le dossier : inadaptée à une prise de contact. Une route dédiée a
  été ajoutée (§3).

## 2. Direction artistique (phase 2)

- Fond crème `#FAF5EC`, encre marine, bleu de marque pour les actions, un
  seul accent chaud « piment » `#B93C12` (surtitres, petits motifs).
- Titres : Bricolage Grotesque (caractère, chaleur) ; texte : Nunito Sans.
- Motif de marque : les trois traits de vitesse du logo, réutilisés comme
  élément graphique (hero, bandeau, 404, image de partage).
- Pas de dégradés décoratifs, pas de verre dépoli, pas d’emoji, pas de
  statistiques ni d’avis.

## 3. Réalisé

| Phase | État | Vérifié |
|---|---|---|
| 3 En-tête, hero | ✅ | photo principale + vignette + aperçu du suivi (statuts réels de l’app) ; sur téléphone la photo vient en premier |
| 4 Photographies | ✅ | 6 photos CC0 (WordPress Photos, StockSnap, rawpixel) via l’API Openverse, licence vérifiée ; voir `CREDITS.md` |
| 5 Plats, fonctionnement, avantages | ✅ | vrai catalogue (8 plats avec photo) ; repli « photos d’illustration » si l’API ne répond pas (constaté lors d’un bug de `limit`) ; avantages limités aux fonctions réelles (espèces à la réception, suivi, discussion, code de remise en livraison) |
| 6 Partenaires + formulaire | ✅ | voir §4 |
| 7 Pied de page, pages légales, SEO | ✅ | mentions légales et confidentialité ; métadonnées, Open Graph (image 1200×630), icônes, `robots.txt`, `sitemap.xml`, canonique, JSON-LD `Organization` (si domaine configuré) |
| 8 Responsive, animations, performance, accessibilité | ✅ | voir §5 |
| 9 Connexions | ✅ | catalogue réel (ISR 5 min), candidature enregistrée en base et traitée dans l’admin |
| 10 Tests, documentation | ✅ | README, `.env.example`, ce fichier |

### Backend ajouté (sans modification de l’existant)

- Modèle `PartnerRequest` + migration additive
  `20261018170000_partner_requests` (une table, un type énuméré).
- `POST /api/v1/partner-requests` : public, DTO validé, téléphone normalisé
  (`90 12 34 56` → `+22890123456`), champ piège anti-robot, refus d’un doublon
  en attente (24 h), limite de 5 envois par heure et par IP.
- `GET/PATCH /api/v1/admin/partner-requests` : admin uniquement, changement
  d’état journalisé (`PARTNER_REQUEST_UPDATED`). Page « Candidatures » dans
  l’admin.

## 4. Formulaire « Proposer mon restaurant »

Vérifié dans Chrome (390 px) contre le backend : envoi vide bloqué sans
requête ; demande valide enregistrée puis confirmée (message affiché,
ramené à l’écran et focalisé) ; doublon refusé avec message clair ; limite
anti-abus déclenchée au-delà de 5 envois ; la demande apparaît dans l’admin.
Les demandes créées par ces essais ont été supprimées de la base de
développement.

## 5. Tests exécutés (2026-10-19)

- `npm run lint` : 0 problème ; `npm run typecheck` : 0 erreur ;
  `npm test` : **9/9** (validation du formulaire, configuration des liens,
  URL d’images, succès seulement après 201, pas de double envoi, erreurs
  serveur et réseau).
- `npm run build` : ✅ (pages statiques, accueil régénéré toutes les 5 min).
- Navigateur, build de production : accueil, mentions légales et
  confidentialité à **320, 360, 390, 430 et 1366 px** : aucune erreur
  JavaScript ni console, aucun débordement horizontal, aucune image cassée.
- Performance (production, mobile 390 px, réseau « 3G rapide », processeur
  ×4) : premier affichage 0,7–0,8 s, LCP 1,4–1,8 s, CLS 0, 312 Ko au
  chargement initial (hero servi en AVIF).
- Accessibilité : un seul `h1`, hiérarchie sans saut, toutes les images ont
  un `alt`, ordre de tabulation logique avec contour visible, lien
  d’évitement, menu fermé par Échap, contrastes ≥ 4,5 pour le texte courant
  (couleurs corrigées après mesure), `prefers-reduced-motion` respecté.
- Backend : unitaires **389/389**, e2e **244/244** (dont 3 pour les
  candidatures).

## 6. Variables à renseigner avant la mise en ligne

`NEXT_PUBLIC_SITE_URL` (sinon `noindex`), au moins une URL d’application
(`NEXT_PUBLIC_CLIENT_APP_URL`, `…_ANDROID_APP_URL` ou `…_IOS_APP_URL`, sinon
« Commander » mène à une section qui indique honnêtement que l’application
n’est pas encore publiée), un contact (`NEXT_PUBLIC_CONTACT_*`) et les
mentions légales (`NEXT_PUBLIC_LEGAL_*`, sinon « À compléter avant la mise en
ligne » s’affiche). Détail : `README.md` et `.env.example`.

## 7. Limites restantes

1. **Pas d’application à télécharger** : aucun lien de store ni app web
   n’existe encore.
2. **Données de démonstration** : en développement, le catalogue et la liste
   des restaurants affichent la base de démo, dont « Chez Awa Test », un
   restaurant de test validé. En production, seuls les vrais restaurants
   validés apparaîtront.
3. **IP derrière le relais** : la limite anti-abus suppose que le backend lit
   la vraie IP du visiteur (`TRUST_PROXY_HOPS`) ; à vérifier au déploiement.
4. **Aucune notification** à l’équipe lors d’une nouvelle candidature :
   elle est visible dans l’admin (compteur), pas encore envoyée par SMS ou
   e-mail.
5. **Animations au défilement** en CSS (`animation-timeline`) : Chrome et
   Edge (dont Chrome Android) ; les autres navigateurs affichent le contenu
   sans animation.
6. **Photos StockSnap en 960 px** (téléchargement direct bloqué par le site) :
   suffisant pour leurs usages (vignettes, fond assombri), pas pour un grand
   format.
7. Logo disponible seulement en PNG 320 px : un SVG serait préférable.
