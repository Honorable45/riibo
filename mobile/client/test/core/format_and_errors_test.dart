import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/format/phone.dart';

void main() {
  group('formatXof', () {
    test('groupe les milliers avec des espaces insécables', () {
      expect(formatXof(2350), '2 350 F');
      expect(formatXof(0), '0 F');
      expect(formatXof(1250000), '1 250 000 F');
    });

    test('remise négative', () {
      expect(formatXof(-500), '−500 F');
    });

    test('forme longue', () {
      expect(formatXofLong(2350), '2 350 F CFA');
    });
  });

  group('PhoneNumbers.normalize', () {
    test('numéro local togolais', () {
      expect(PhoneNumbers.normalize('90 12 34 56'), '+22890123456');
      expect(PhoneNumbers.normalize('90-12-34-56'), '+22890123456');
    });

    test('formats internationaux', () {
      expect(PhoneNumbers.normalize('+228 90 12 34 56'), '+22890123456');
      expect(PhoneNumbers.normalize('0022890123456'), '+22890123456');
      expect(PhoneNumbers.normalize('22890123456'), '+22890123456');
      expect(PhoneNumbers.normalize('+33 6 12 34 56 78'), '+33612345678');
    });

    test('refuse les saisies invalides', () {
      expect(PhoneNumbers.normalize(''), isNull);
      expect(PhoneNumbers.normalize('abc'), isNull);
      expect(PhoneNumbers.normalize('9012'), isNull);
      expect(PhoneNumbers.normalize('+228 90 12 34'), isNull);
      expect(PhoneNumbers.normalize('+1234567890123456'), isNull);
    });

    test('affichage', () {
      expect(PhoneNumbers.display('+22890123456'), '+228 90 12 34 56');
      expect(PhoneNumbers.display('+33612345678'), '+33612345678');
    });
  });

  group('ApiException.fromResponse', () {
    test('message simple du backend', () {
      final e = ApiException.fromResponse(400, {
        'statusCode': 400,
        'message': 'Votre panier est vide.',
      });
      expect(e.kind, ApiErrorKind.validation);
      expect(e.message, 'Votre panier est vide.');
    });

    test('erreur de validation Nest (liste de messages)', () {
      final e = ApiException.fromResponse(400, {
        'statusCode': 400,
        'message': {
          'statusCode': 400,
          'message': ['Numéro de téléphone invalide.', 'Code invalide.'],
          'error': 'Bad Request',
        },
      });
      expect(e.message, 'Numéro de téléphone invalide.\nCode invalide.');
    });

    test('erreur métier avec code', () {
      final e = ApiException.fromResponse(409, {
        'statusCode': 409,
        'message': {
          'code': 'CART_OTHER_RESTAURANT',
          'message': 'Votre panier contient des plats d’un autre restaurant.',
        },
      });
      expect(e.kind, ApiErrorKind.conflict);
      expect(e.code, 'CART_OTHER_RESTAURANT');
      expect(e.message, contains('autre restaurant'));
    });

    test('jamais de message technique pour une erreur serveur', () {
      final e = ApiException.fromResponse(500, {'message': 'Prisma P2002'});
      expect(e.kind, ApiErrorKind.server);
      expect(e.message, isNot(contains('Prisma')));
    });

    test('502 et 504 sont incertains', () {
      expect(ApiException.fromResponse(504, null).isUncertain, isTrue);
      expect(ApiException.fromResponse(500, null).isUncertain, isFalse);
    });
  });
}
