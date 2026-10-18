import type { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import request from 'supertest';

export interface TestUser {
  id: string;
  username: string;
  phone: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

export type TestAccountType = 'CLIENT' | 'RESTAURANT' | 'LIVREUR';

/**
 * Compte de test complet (inscrit + connecté) — un compte différent à chaque
 * appel. Le nom d'utilisateur est généré par le serveur à partir du téléphone
 * (il n'est plus choisi à l'inscription) : lire `username` sur le résultat.
 * `username` est accepté dans `overrides` uniquement pour ne pas casser les
 * anciens appels ; il est ignoré.
 */
export async function registerTestUser(
  app: INestApplication,
  overrides: Partial<{
    accountType: TestAccountType;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    phone: string;
    password: string;
    restaurantName: string;
    restaurantAddress: string;
  }> = {},
): Promise<TestUser> {
  const accountType = overrides.accountType ?? 'CLIENT';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const phone = overrides.phone ?? `+2289${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
    const body: Record<string, unknown> = {
      accountType,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      phone,
      password: overrides.password ?? 'un-mot-de-passe-solide',
      ...(overrides.email ? { email: overrides.email } : {}),
      ...(accountType === 'RESTAURANT'
        ? {
            restaurantName: overrides.restaurantName ?? `Resto ${phone}`,
            restaurantAddress: overrides.restaurantAddress ?? 'Agoè, Lomé',
          }
        : {}),
    };

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body);
    // Téléphone tiré au hasard déjà pris : on retente (jamais si `phone` est imposé).
    if (response.status === 409 && !overrides.phone) continue;
    if (response.status !== 201) {
      throw new Error(`Inscription de test échouée (${response.status}) : ${JSON.stringify(response.body)}`);
    }

    return {
      id: response.body.user.id as string,
      username: response.body.user.username as string,
      phone,
      role: response.body.user.role as string,
      accessToken: response.body.accessToken as string,
      refreshToken: response.body.refreshToken as string,
    };
  }
  throw new Error("Impossible de générer un téléphone de test libre.");
}
