import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/app/config/env.dart';

void main() {
  test('les chemins de médias relatifs sont résolus sur l’origine du backend', () {
    final origin = Env.apiOrigin.toString();
    expect(
      Env.mediaUrl('/api/v1/media/menu/abc.jpg'),
      '$origin/api/v1/media/menu/abc.jpg',
    );
  });

  test('une URL absolue (Cloudinary) est conservée, une valeur vide ignorée', () {
    const cdn = 'https://res.cloudinary.com/demo/image/upload/plat.jpg';
    expect(Env.mediaUrl(cdn), cdn);
    expect(Env.mediaUrl(''), isNull);
    expect(Env.mediaUrl(null), isNull);
    expect(Env.mediaUrl('javascript:alert(1)'), isNull);
  });
}
