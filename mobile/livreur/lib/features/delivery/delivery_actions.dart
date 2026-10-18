import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:url_launcher/url_launcher.dart';

/// Conversations de la course : avec le client (`ORDER_DELIVERY`) et avec le
/// restaurant (`ORDER_RESTAURANT_DRIVER`), créées par le serveur à
/// l'acceptation.
class DeliveryConversation {
  const DeliveryConversation({
    required this.id,
    required this.kind,
    required this.isClosed,
  });

  final String id;
  final String kind;
  final bool isClosed;

  bool get withClient => kind == 'ORDER_DELIVERY';
}

final deliveryConversationsProvider = FutureProvider.autoDispose
    .family<List<DeliveryConversation>, String>((ref, orderId) async {
      final data = await ref
          .watch(apiClientProvider)
          .get<Json>('/conversations', query: {'limit': 30});
      return data
          .list('items', (c) => c)
          .where((c) => (c.objOrNull('order')?['id']) == orderId)
          .map(
            (c) => DeliveryConversation(
              id: c.str('id'),
              kind: c.str('kind'),
              isClosed: c.boolean('isClosed'),
            ),
          )
          .where(
            (c) =>
                c.kind == 'ORDER_DELIVERY' ||
                c.kind == 'ORDER_RESTAURANT_DRIVER',
          )
          .toList();
    });

/// Ouvre l'application de navigation du téléphone vers une destination.
/// L'itinéraire est calculé par cette application (aucun service d'itinéraire
/// n'est configuré dans Riiberaka).
Future<bool> openNavigation({
  double? latitude,
  double? longitude,
  String? address,
}) async {
  final Uri uri;
  if (latitude != null && longitude != null) {
    uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude&travelmode=driving',
    );
  } else if (address != null && address.isNotEmpty) {
    uri = Uri.https('www.google.com', '/maps/search/', {
      'api': '1',
      'query': address,
    });
  } else {
    return false;
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<bool> callNumber(String phone) =>
    launchUrl(Uri(scheme: 'tel', path: phone.replaceAll(' ', '')));

/// Motifs proposés au livreur pour signaler un problème (`POST /reports`).
/// Un signalement ne change jamais l'état de la course : l'équipe Riiberaka
/// le traite depuis l'administration.
const driverReportReasons = [
  'Client injoignable',
  'Client absent',
  'Code de remise incorrect ou indisponible',
  'Adresse incorrecte',
  'Le client refuse la commande',
  'Problème de paiement',
  'Problème avec le restaurant',
  'Commande indisponible',
  'Autre problème',
];
