# Riiberaka Client (Flutter)

Application mobile client de Riiberaka : découvrir les restaurants, commander,
suivre sa livraison. Backend : `../../backend` (NestJS), inchangé.

- État d'avancement : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- API utilisées et limites du backend : [docs/API_AUDIT.md](docs/API_AUDIT.md)

## Prérequis

Flutter 3.44 / Dart 3.12, SDK Android 36. Backend local démarré
(`cd ../../backend && npm run start:dev`, PostgreSQL + Redis).

## Configuration

L'adresse du backend est fixée à la compilation :

```bash
cp config/dev.example.json config/dev.json   # puis ajuster API_BASE_URL
flutter run --dart-define-from-file=config/dev.json
```

| Cible | API_BASE_URL |
|---|---|
| Émulateur Android | `http://10.0.2.2:4000` (défaut en debug) |
| Téléphone en USB | `http://localhost:4000` + `adb reverse tcp:4000 tcp:4000` |
| Téléphone en Wi-Fi | `http://<IP-du-poste>:4000` |
| Production | `https://…` (obligatoire : le HTTP en clair n'est permis qu'en debug) |

Aucun secret n'est embarqué dans l'application.

## Tests

```bash
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze
flutter test                                  # unitaires + widgets (doublures)

# Intégration RÉELLE (backend local + données de démo SEED_DEMO=true),
# sur téléphone, captures écrites dans $SCREENSHOT_DIR :
SCREENSHOT_DIR=/tmp/shots flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/order_flow_test.dart \
  -d <appareil> --dart-define=API_BASE_URL=http://localhost:4000
```

Les tests d'intégration modifient le panier, les adresses et les commandes
du compte client de démonstration : uniquement sur une base de développement.

## Build

```bash
flutter build apk --debug --dart-define-from-file=config/dev.json
flutter build apk --release --dart-define=API_BASE_URL=https://api.exemple.com
```

La signature release, l'icône et l'écran de démarrage définitifs restent à
configurer (clé de signature à fournir — jamais dans le dépôt).
