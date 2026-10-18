# Riiberaka Restaurant (Flutter)

Application des restaurants partenaires Riiberaka : commandes en temps réel
(accepter, refuser avec motif, préparer, prête, remise), menu, disponibilité,
horaires, statistiques du jour, avis, notifications et assistance.
Backend : `../../backend` (inchangé). Socle partagé : `../packages/riiberaka_core`.

État détaillé : [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Configuration

| Variable (`--dart-define`) | Rôle |
|---|---|
| `API_BASE_URL` | Origine du backend (REST et Socket.IO), sans `/api/v1` |

Exemple : `config/dev.example.json` (`--dart-define-from-file=config/dev.example.json`).

| Cible | Valeur |
|---|---|
| Émulateur | `http://10.0.2.2:4000` (défaut en debug) |
| Téléphone USB | `http://localhost:4000` + `adb reverse tcp:4000 tcp:4000` |
| Téléphone Wi-Fi | `http://<IP-du-poste>:4000` |
| Production | `https://…` (HTTP en clair refusé hors debug) |

Aucun secret n'est compilé dans l'application ; les jetons de session sont
dans le stockage sécurisé du téléphone.

Accès : seuls les comptes de rôle `RESTAURANT` rattachés à un restaurant.
Le propriétaire (OWNER) gère tout ; l'équipe (STAFF) traite les commandes et
peut seulement mettre en pause. Commandes disponibles une fois le restaurant
validé par Riiberaka.

Notifications push natives : non configurées (Firebase). Quand l'app est
ouverte, une nouvelle commande déclenche un son et une vibration.

## Permissions

Android : `INTERNET` ; accès aux photos via le sélecteur système (pas de
permission de stockage). iOS : `NSPhotoLibraryUsageDescription`.

## Commandes

```bash
flutter analyze && flutter test
flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:4000

# Parcours réel sur l'ordinateur (backend local, base de DÉVELOPPEMENT
# avec données de démo) : crée une commande à emporter et la traite.
flutter test test_real_backend --dart-define=API_BASE_URL=http://localhost:4100

# Captures d'écran sans téléphone (données de démonstration)
flutter test test_screenshots --update-goldens --dart-define=SHOTS_DIR=/tmp/shots
```

Le test réel ouvre temporairement le restaurant de démo toute la journée,
puis restaure ses horaires d'origine. Ne jamais le lancer sur la production.
