# Riiberaka Livreur (Flutter)

Application des livreurs Riiberaka : disponibilité, propositions de course,
retrait au restaurant, remise au client, historique. Backend : `../../backend`
(inchangé). Socle partagé : `../packages/riiberaka_core`.

État détaillé : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Configuration

| Variable (`--dart-define`) | Rôle |
|---|---|
| `API_BASE_URL` | Origine du backend (REST et Socket.IO), sans `/api/v1` |

| Cible | Valeur |
|---|---|
| Émulateur | `http://10.0.2.2:4000` (défaut en debug) |
| Téléphone USB | `http://localhost:4000` + `adb reverse tcp:4000 tcp:4000` |
| Téléphone Wi-Fi | `http://<IP-du-poste>:4000` |
| Production | `https://…` (HTTP en clair refusé hors debug) |

Aucun secret n'est compilé dans l'application.

Cartes : tuiles OpenStreetMap (pilote). Une diffusion large exige un
fournisseur de tuiles sous contrat. Itinéraire : ouvert dans l'application
de navigation du téléphone (aucun service d'itinéraire configuré).

Notifications push natives : non configurées (projet Firebase,
`google-services.json`, `FIREBASE_SERVICE_ACCOUNT` côté backend).

## Permissions Android

`INTERNET`, `ACCESS_FINE/COARSE_LOCATION`, `FOREGROUND_SERVICE(_LOCATION)`
(position partagée écran verrouillé, avec notification visible, uniquement
en ligne), `POST_NOTIFICATIONS`, `WAKE_LOCK`. Pas de localisation en
arrière-plan permanente.

## Commandes

```bash
flutter analyze && flutter test
flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:4000

# Parcours réel complet (backend local, SEED_DEMO=true, base de développement) :
SCREENSHOT_DIR=/tmp/shots flutter drive --driver=test_driver/integration_test.dart \
  --target=integration_test/delivery_flow_test.dart -d <appareil> \
  --dart-define=API_BASE_URL=http://localhost:4000
```
