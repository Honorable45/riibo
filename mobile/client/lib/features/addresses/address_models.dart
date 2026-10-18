import 'package:riiberaka_core/core/api/json.dart';

enum AddressLabel {
  maison('MAISON', 'Maison'),
  travail('TRAVAIL', 'Travail'),
  autre('AUTRE', 'Autre');

  const AddressLabel(this.api, this.display);
  final String api;
  final String display;

  static AddressLabel parse(String? value) => values.firstWhere(
    (l) => l.api == value,
    orElse: () => AddressLabel.autre,
  );
}

/// Adresse enregistrée sur le compte (`/addresses`).
class Address {
  const Address({
    required this.id,
    required this.label,
    required this.fullAddress,
    this.customLabel,
    this.quarter,
    this.landmark,
    this.latitude,
    this.longitude,
    this.isDefault = false,
  });

  factory Address.fromJson(Json json) => Address(
    id: json.str('id'),
    label: AddressLabel.parse(json.strOrNull('label')),
    customLabel: json.strOrNull('customLabel'),
    fullAddress: json.str('fullAddress'),
    quarter: json.strOrNull('quarter'),
    landmark: json.strOrNull('landmark'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
    isDefault: json.boolean('isDefault'),
  );

  final String id;
  final AddressLabel label;
  final String? customLabel;
  final String fullAddress;
  final String? quarter;
  final String? landmark;
  final double? latitude;
  final double? longitude;
  final bool isDefault;

  String get title =>
      label == AddressLabel.autre && (customLabel?.isNotEmpty ?? false)
      ? customLabel!
      : label.display;

  String get line => quarter == null || quarter!.isEmpty
      ? fullAddress
      : '$fullAddress ($quarter)';

  bool get hasCoordinates => latitude != null && longitude != null;
}

/// Saisie d'une adresse (création ou modification).
class AddressInput {
  const AddressInput({
    required this.label,
    required this.fullAddress,
    this.customLabel,
    this.quarter,
    this.landmark,
    this.latitude,
    this.longitude,
    this.isDefault = false,
  });

  final AddressLabel label;
  final String? customLabel;
  final String fullAddress;
  final String? quarter;
  final String? landmark;
  final double? latitude;
  final double? longitude;
  final bool isDefault;

  /// Corps conforme à CreateAddressDto/UpdateAddressDto (champs inconnus
  /// refusés par le serveur : seuls ceux-ci sont envoyés). En modification,
  /// un champ vidé est envoyé vide pour être effacé côté serveur.
  Json toJson({bool forUpdate = false}) {
    String? clean(String? v) {
      final value = v?.trim() ?? '';
      if (value.isNotEmpty) return value;
      return forUpdate ? '' : null;
    }

    return {
      'label': label.api,
      'customLabel': ?(label == AddressLabel.autre ? clean(customLabel) : null),
      'fullAddress': fullAddress.trim(),
      'quarter': ?clean(quarter),
      'landmark': ?clean(landmark),
      if (latitude != null && longitude != null) ...{
        'latitude': latitude,
        'longitude': longitude,
      },
      // Jamais `false` : le serveur garde toujours une adresse principale.
      if (isDefault) 'isDefault': true,
    };
  }
}
