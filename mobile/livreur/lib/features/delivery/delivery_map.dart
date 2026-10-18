import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';

/// Carte de la course : restaurant, destination et position du livreur.
///
/// Fonds de carte OpenStreetMap : convenables en développement et en
/// pilote, mais un fournisseur de tuiles avec contrat (clé publique) est
/// nécessaire avant une diffusion large (politique d'usage d'OSM).
class DeliveryMap extends StatelessWidget {
  const DeliveryMap({
    super.key,
    this.restaurant,
    this.destination,
    this.me,
    this.focusOnDestination = false,
  });

  final LatLng? restaurant;
  final LatLng? destination;
  final LatLng? me;
  final bool focusOnDestination;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final points = [?restaurant, ?destination, ?me];
    if (points.isEmpty) {
      return ColoredBox(
        color: p.skeleton,
        child: Center(
          child: Text(
            'Coordonnées indisponibles',
            style: context.text.bodySmall,
          ),
        ),
      );
    }
    final target = focusOnDestination ? destination : restaurant;
    final fit = points.length >= 2
        ? CameraFit.coordinates(
            coordinates: points,
            padding: const EdgeInsets.all(48),
            maxZoom: 16,
          )
        : null;
    Marker marker(LatLng at, IconData icon, Color color, String label) =>
        Marker(
          point: at,
          width: 40,
          height: 40,
          child: Semantics(
            label: label,
            child: Container(
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2.5),
                boxShadow: const [
                  BoxShadow(color: Color(0x33000000), blurRadius: 6),
                ],
              ),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
          ),
        );
    return FlutterMap(
      options: MapOptions(
        initialCenter: target ?? points.first,
        initialZoom: 15,
        initialCameraFit: fit,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.riiberaka.livreur',
        ),
        MarkerLayer(
          markers: [
            if (restaurant != null)
              marker(
                restaurant!,
                Icons.storefront_rounded,
                p.ink,
                'Restaurant',
              ),
            if (destination != null)
              marker(destination!, Icons.home_rounded, p.success, 'Client'),
            if (me != null)
              marker(me!, Icons.navigation_rounded, p.brand, 'Ma position'),
          ],
        ),
        Align(
          alignment: Alignment.bottomRight,
          child: Container(
            margin: const EdgeInsets.all(4),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            color: const Color(0xCCFFFFFF),
            child: const Text(
              '© OpenStreetMap',
              style: TextStyle(fontSize: 10, color: Color(0xFF333333)),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ],
    );
  }
}
