# Riiberaka — site vitrine

Site public de Riiberaka (Next.js 16, App Router, TypeScript, Tailwind CSS 4).
Il présente le service, affiche les plats réellement proposés par les
restaurants (catalogue public du backend) et recueille les candidatures des
restaurants.

État, choix et limites : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
Crédits photo : [CREDITS.md](CREDITS.md).

## Lancer

Prérequis : Node 24, dépendances installées à la racine (`npm install`,
workspaces), backend démarré pour le catalogue et le formulaire.

```bash
npm run dev:site                               # depuis la racine, http://localhost:3004
BACKEND_URL=http://localhost:4100 npx next dev -p 3004   # depuis site/, backend sur un autre port

npm run lint && npm run typecheck && npm test  # vérifications
npm run build && npm start                     # production (port 3004)
```

Sans backend joignable, le site s’affiche quand même : la section des plats
passe en galerie de photos d’illustration et la liste des restaurants est
masquée. Le formulaire signale alors l’échec, sans faux succès.

## Variables

Voir [.env.example](.env.example). Toutes sont publiques sauf `BACKEND_URL`
(lue côté serveur). Aucune URL de production n’est codée en dur : une valeur
absente masque l’élément concerné.

| Variable | Effet |
|---|---|
| `BACKEND_URL` | Catalogue (ISR 5 min), images du stockage local, relais du formulaire |
| `NEXT_PUBLIC_SITE_URL` | Canonique, sitemap, Open Graph absolu, données structurées ; vide = `noindex` |
| `NEXT_PUBLIC_CLIENT_APP_URL`, `…_ANDROID_APP_URL`, `…_IOS_APP_URL` | Cible du bouton « Commander » (la première renseignée) ; vide = section « application » |
| `NEXT_PUBLIC_RESTAURANT_APP_URL` | Lien « Déjà partenaire ? » |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `…_CONTACT_PHONE`, `…_WHATSAPP_NUMBER` | Contacts du pied de page et secours du formulaire |
| `NEXT_PUBLIC_FACEBOOK_URL`, `…_INSTAGRAM_URL`, `…_TIKTOK_URL` | Réseaux sociaux |
| `NEXT_PUBLIC_LEGAL_*` | Mentions légales |

## Déploiement (Vercel)

Nouveau projet, Root Directory `site`, « Include source files outside of the
Root Directory » activé (workspaces). Renseigner les variables ci-dessus.

Côté backend (Render) :

- `TRUST_PROXY_HOPS` doit permettre de lire l’IP réelle du visiteur à travers
  Vercel, sinon la limite anti-abus du formulaire (5 demandes par heure et par
  IP) s’appliquerait à tous les visiteurs à la fois ;
- appliquer la migration `20261018170000_partner_requests`
  (`prisma migrate deploy`, fait automatiquement au déploiement Render).

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | Pages : accueil, mentions légales, confidentialité, 404 ; `robots.ts`, `sitemap.ts`, icônes |
| `components/` | En-tête, hero, sections, formulaire partenaire, pied de page |
| `lib/config.ts` | Toute la configuration publique |
| `lib/catalog.ts` | Lecture du catalogue public du backend |
| `lib/photos.ts` | Photos éditoriales (légendes exactes) |
| `public/images/` | Logo (copie de l’app mobile), photos CC0, image Open Graph |
