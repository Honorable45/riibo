import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { User, UserSession } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail/mail.service';
import { OtpService } from './otp/otp.service';

jest.mock('bcrypt');

const mockedBcrypt = jest.mocked(bcrypt);

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'honore',
    email: 'honore@example.com',
    phone: null,
    passwordHash: 'hashed-password',
    phoneVerifiedAt: null,
    phoneHash: null,
    emailVerifiedAt: null,
    suspendedReason: null,
    firstName: 'Honoré',
    lastName: 'K.',
    isActive: true,
    role: 'CLIENT',
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    type: 'MOBILE',
    refreshTokenHash: '',
    previousRefreshTokenHash: null,
    userAgent: null,
    ipAddress: null,
    deviceLabel: null,
    fcmToken: null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    revokedAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    userSession: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    passwordResetToken: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    restaurant: { create: jest.Mock; findUnique: jest.Mock };
    driverProfile: { create: jest.Mock };
    pushSubscription: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock };
  let otp: {
    request: jest.Mock;
    verify: jest.Mock;
    consume: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      userSession: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      passwordResetToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      restaurant: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      driverProfile: { create: jest.fn() },
      pushSubscription: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    // Deux formes de transaction : callback (register) et tableau d'opérations (déconnexions).
    prisma.$transaction.mockImplementation((arg: ((tx: unknown) => unknown) | Array<Promise<unknown>>) =>
      Array.isArray(arg) ? Promise.all(arg) : Promise.resolve(arg(prisma)),
    );
    jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    config = {
      get: jest.fn((key: string) => (key === 'JWT_REFRESH_EXPIRES_IN' ? '30d' : undefined)),
      getOrThrow: jest.fn((key: string) => `secret-${key}`),
    };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    otp = {
      request: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn(),
      consume: jest.fn().mockResolvedValue(undefined),
    };

    jwt.signAsync.mockResolvedValue('signed-token');
    mockedBcrypt.hash.mockResolvedValue('hashed-value' as never);

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      mail as unknown as MailService,
      otp as unknown as OtpService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Bascule REGISTRATION_OTP_ENABLED (voir isRegistrationOtpEnabled) —
    // jamais fuiter d'un test à l'autre : chaque test la fixe explicitement
    // s'il en a besoin, sinon la valeur par défaut (absente = désactivée) s'applique.
    delete process.env.REGISTRATION_OTP_ENABLED;
  });

  describe('register', () => {
    const base = {
      firstName: 'Jean',
      phone: '+22890000001',
      password: 'un-mot-de-passe-solide',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null); // téléphone/email/username libres
      prisma.user.create.mockImplementation(({ data }: { data: Partial<User> }) =>
        Promise.resolve(buildUser({ ...data, id: 'user-new' } as Partial<User>)),
      );
      prisma.userSession.create.mockResolvedValue(buildSession());
      prisma.userSession.update.mockResolvedValue(buildSession());
    });

    it('crée un CLIENT et renvoie des tokens, sans jamais exposer le hash', async () => {
      const result = await service.register({ ...base, accountType: 'CLIENT' }, {});

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.role).toBe('CLIENT');
      expect(result.accessToken).toBe('signed-token');
      expect(prisma.restaurant.create).not.toHaveBeenCalled();
      expect(prisma.driverProfile.create).not.toHaveBeenCalled();
    });

    it('le rôle est fixé par le serveur : accountType RESTAURANT crée un restaurant PENDING dont le compte est OWNER', async () => {
      const result = await service.register(
        {
          ...base,
          accountType: 'RESTAURANT',
          restaurantName: 'Chez Maman',
          restaurantAddress: 'Agoè, près du marché',
        },
        {},
      );

      expect(result.user.role).toBe('RESTAURANT');
      expect(prisma.restaurant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Chez Maman',
          slug: 'chez-maman',
          status: 'PENDING',
          members: { create: { userId: 'user-new', role: 'OWNER' } },
        }) as unknown,
      });
    });

    it('un slug déjà pris reçoit un suffixe numérique', async () => {
      prisma.restaurant.findUnique
        .mockResolvedValueOnce({ id: 'existant' })
        .mockResolvedValueOnce(null);

      await service.register(
        { ...base, accountType: 'RESTAURANT', restaurantName: 'Chez Maman', restaurantAddress: 'Agoè' },
        {},
      );

      expect(prisma.restaurant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'chez-maman-2' }) as unknown,
      });
    });

    it('exige nom et adresse pour un restaurant', async () => {
      await expect(
        service.register({ ...base, accountType: 'RESTAURANT' }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('accountType LIVREUR crée un profil livreur PENDING', async () => {
      const result = await service.register(
        { ...base, accountType: 'LIVREUR', vehicleType: 'MOTO', plateNumber: 'TG-1-AB' },
        {},
      );

      expect(result.user.role).toBe('LIVREUR');
      expect(prisma.driverProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'PENDING', vehicleType: 'MOTO' }) as unknown,
      });
    });

    it("n'accepte jamais ADMIN, même si le DTO est contourné", async () => {
      await expect(
        service.register({ ...base, accountType: 'ADMIN' as never }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuse un numéro déjà utilisé', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        service.register({ ...base, accountType: 'CLIENT' }, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('génère un username à partir du téléphone et ne demande jamais de username', async () => {
      await service.register({ ...base, accountType: 'CLIENT' }, {});

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: 'user90000001',
          role: 'CLIENT',
          phone: '+22890000001',
        }) as unknown,
      });
    });

    it('refuse de créer le compte quand le code OTP est invalide, une fois REGISTRATION_OTP_ENABLED=true (jamais de bypass silencieux)', async () => {
      process.env.REGISTRATION_OTP_ENABLED = 'true';
      otp.verify.mockRejectedValue(new UnauthorizedException('Code invalide ou expiré.'));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyRegisterOtp(
          {
            phone: '+22890000000',
            code: '123456',
          },
          { userAgent: 'jest', ipAddress: '127.0.0.1' },
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuse sans même appeler OtpService si aucun code n’est fourni alors que REGISTRATION_OTP_ENABLED=true', async () => {
      process.env.REGISTRATION_OTP_ENABLED = 'true';
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyRegisterOtp(
          { phone: '+22890000000' },
          { userAgent: 'jest', ipAddress: '127.0.0.1' },
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(otp.verify).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('crée le compte avec le numéro vérifié une fois le code OTP valide (REGISTRATION_OTP_ENABLED=true)', async () => {
      process.env.REGISTRATION_OTP_ENABLED = 'true';
      otp.verify.mockResolvedValue({ id: 'otp-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser({ phone: '+22890000000' }));
      prisma.userSession.create.mockResolvedValue(buildSession());
      prisma.userSession.update.mockResolvedValue(buildSession());

      await expect(
        service.verifyRegisterOtp(
          {
            phone: '+22890000000',
            code: '123456',
          },
          { userAgent: 'jest', ipAddress: '127.0.0.1' },
        ),
      ).resolves.toEqual(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ user: expect.objectContaining({ phone: '+22890000000' }) }),
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ phoneVerifiedAt: expect.any(Date) }),
        }),
      );
      expect(otp.consume).toHaveBeenCalledWith('otp-1');
    });

    it('crée le compte SANS appeler OtpService ni marquer le numéro vérifié quand REGISTRATION_OTP_ENABLED est absent/false', async () => {
      delete process.env.REGISTRATION_OTP_ENABLED;
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser({ phone: '+22890000000' }));
      prisma.userSession.create.mockResolvedValue(buildSession());
      prisma.userSession.update.mockResolvedValue(buildSession());

      const result = await service.verifyRegisterOtp(
        { phone: '+22890000000' },
        { userAgent: 'jest', ipAddress: '127.0.0.1' },
      );

      expect(otp.verify).not.toHaveBeenCalled();
      expect(otp.consume).not.toHaveBeenCalled();
      expect(result.user.phone).toBe('+22890000000');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Aucun code contrôlé : le numéro n'est JAMAIS marqué vérifié.
          data: expect.objectContaining({ phoneVerifiedAt: null }) as unknown,
        }),
      );
    });
  });

  describe('requestOtp — bascule REGISTRATION_OTP_ENABLED (numéro pas encore inscrit)', () => {
    it("n'envoie aucun SMS d'inscription par défaut (bascule absente/désactivée), mais renvoie quand même purpose=REGISTER", async () => {
      delete process.env.REGISTRATION_OTP_ENABLED;
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.requestOtp('+22890000000', '127.0.0.1');

      expect(result).toEqual({ purpose: 'REGISTER' });
      expect(otp.request).not.toHaveBeenCalled();
    });

    it('envoie bien le SMS une fois REGISTRATION_OTP_ENABLED=true', async () => {
      process.env.REGISTRATION_OTP_ENABLED = 'true';
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestOtp('+22890000000', '127.0.0.1');

      expect(otp.request).toHaveBeenCalledWith('+22890000000', 'REGISTER', '127.0.0.1');
    });

    it('la connexion garde toujours son OTP normal, quelle que soit la bascule (numéro déjà inscrit)', async () => {
      delete process.env.REGISTRATION_OTP_ENABLED;
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: true }));

      await service.requestOtp('+22890000000', '127.0.0.1');

      expect(otp.request).toHaveBeenCalledWith('+22890000000', 'LOGIN', '127.0.0.1');
    });
  });

  describe('requestRegisterOtp', () => {
    it("n'envoie aucun SMS par défaut (bascule absente/désactivée)", async () => {
      delete process.env.REGISTRATION_OTP_ENABLED;
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestRegisterOtp('+22890000000', '127.0.0.1');

      expect(otp.request).not.toHaveBeenCalled();
    });

    it('envoie le SMS une fois REGISTRATION_OTP_ENABLED=true', async () => {
      process.env.REGISTRATION_OTP_ENABLED = 'true';
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestRegisterOtp('+22890000000', '127.0.0.1');

      expect(otp.request).toHaveBeenCalledWith('+22890000000', 'REGISTER', '127.0.0.1');
    });

    it('refuse toujours si le numéro est déjà utilisé, avant même de regarder la bascule', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(service.requestRegisterOtp('+22890000000', '127.0.0.1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(otp.request).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    // Convention de ce bloc : mockedBcrypt.compare(token, hash) renvoie vrai
    // seulement si hash === `hash-of-${token}` — permet de simuler avec
    // précision quel hash correspond à quel token en clair sans vrai bcrypt.
    beforeEach(() => {
      // Casté vers un type de mock non surchargé : la signature "callback"
      // de bcrypt.compare (renvoie void) fait sinon gagner la mauvaise
      // surcharge lors de l'inférence de mockImplementation.
      (
        mockedBcrypt.compare as unknown as jest.Mock<Promise<boolean>, [string, string]>
      ).mockImplementation((token, hash) => Promise.resolve(hash === `hash-of-${token}`));
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', sessionId: 'session-1' });
    });

    it('accepte le refresh token courant normalement', async () => {
      const session = buildSession({ refreshTokenHash: 'hash-of-current-token' });
      prisma.userSession.findUnique.mockResolvedValue(session);
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh('current-token');

      expect(result.accessToken).toBe('signed-token');
      expect(prisma.userSession.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      // La rotation passe désormais par un verrou optimiste (`updateMany` +
      // condition sur le hash lu à l'instant du fetch), jamais un `update`
      // inconditionnel — voir rotateRefreshTokenAtomic (audit de sécurité).
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: session.id, refreshTokenHash: 'hash-of-current-token' },
        }),
      );
    });

    it(
      'accepte encore le précédent refresh token dans la fenêtre de grâce (deux onglets qui ' +
        'rafraîchissent quasi simultanément avec le même token de départ), sans révoquer la session',
      async () => {
        // Simule le "perdant" de la course : un autre appel a déjà fait
        // tourner le hash vers "new-token", mais celui-ci présente encore
        // l'ancien, tout juste supplanté (rotation il y a un instant).
        const session = buildSession({
          refreshTokenHash: 'hash-of-new-token',
          previousRefreshTokenHash: 'hash-of-old-token',
          lastUsedAt: new Date(),
        });
        prisma.userSession.findUnique.mockResolvedValue(session);
        prisma.user.findUnique.mockResolvedValue(buildUser());
        prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.refresh('old-token');

        expect(result.accessToken).toBe('signed-token');
        expect(prisma.userSession.update).not.toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({ revokedAt: expect.any(Date) }),
          }),
        );
      },
    );

    it(
      'rejette exactement un appel sur deux quand deux requêtes concurrentes présentent le ' +
        'même refresh token valide (verrou optimiste) — sans jamais révoquer la session du gagnant',
      async () => {
        const session = buildSession({ refreshTokenHash: 'hash-of-current-token' });
        prisma.userSession.findUnique.mockResolvedValue(session);
        prisma.user.findUnique.mockResolvedValue(buildUser());
        // Simule l'ordre d'arrivée des écritures : la première requête à
        // atteindre la base gagne (count: 1), la seconde arrive après que
        // le hash a déjà changé (count: 0).
        prisma.userSession.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 });

        const [winner, loser] = await Promise.allSettled([
          service.refresh('current-token'),
          service.refresh('current-token'),
        ]);

        expect(winner.status).toBe('fulfilled');
        expect(loser.status).toBe('rejected');
        if (loser.status === 'rejected') {
          expect(loser.reason).toBeInstanceOf(UnauthorizedException);
        }
        // Le perdant est simplement rejeté — jamais de révocation de la
        // session du gagnant (voir rotateRefreshTokenAtomic).
        expect(prisma.userSession.update).not.toHaveBeenCalled();
      },
    );

    it('révoque la session si le token présenté est plus ancien que le précédent immédiat (vrai rejeu)', async () => {
      const session = buildSession({
        refreshTokenHash: 'hash-of-new-token',
        previousRefreshTokenHash: 'hash-of-old-token',
        lastUsedAt: new Date(),
      });
      prisma.userSession.findUnique.mockResolvedValue(session);

      await expect(service.refresh('really-old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('révoque la session si la fenêtre de grâce est dépassée, même pour le précédent immédiat', async () => {
      const session = buildSession({
        refreshTokenHash: 'hash-of-new-token',
        previousRefreshTokenHash: 'hash-of-old-token',
        lastUsedAt: new Date(Date.now() - 6_000), // > REFRESH_GRACE_PERIOD_MS (5s, audit de sécurité)
      });
      prisma.userSession.findUnique.mockResolvedValue(session);

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('rejette une session déjà révoquée', async () => {
      prisma.userSession.findUnique.mockResolvedValue(buildSession({ revokedAt: new Date() }));

      await expect(service.refresh('peu-importe')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('rejette un mot de passe incorrect sans révéler la cause précise', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        service.login({ identifier: 'honore', password: 'faux' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejette un identifiant inconnu avec le même message que l'échec de mot de passe", async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'inconnu', password: 'peu-importe' }, {}),
      ).rejects.toThrow('Identifiants invalides.');
    });

    it('connecte et renvoie des tokens quand les identifiants sont valides', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(true as never);
      prisma.userSession.create.mockResolvedValue(buildSession());
      prisma.userSession.update.mockResolvedValue(buildSession());

      const result = await service.login({ identifier: 'honore', password: 'bon-mdp' }, {});

      expect(result.accessToken).toBe('signed-token');
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('changePassword', () => {
    it('rejette si le mot de passe actuel est incorrect', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        service.changePassword('user-1', 'session-1', {
          currentPassword: 'faux',
          newPassword: 'nouveau-mot-de-passe',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('met à jour le mot de passe et révoque les autres sessions', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(true as never);
      prisma.user.update.mockResolvedValue(buildUser());
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

      await service.changePassword('user-1', 'session-1', {
        currentPassword: 'bon-mdp',
        newPassword: 'nouveau-mot-de-passe',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ userId: 'user-1', id: { not: 'session-1' } }),
        }),
      );
      // Les autres appareils ne reçoivent plus aucune notification push.
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', sessionId: { not: 'session-1' } },
      });
    });
  });

  describe('revokeSession', () => {
    it("refuse de révoquer la session d'un autre utilisateur", async () => {
      prisma.userSession.findUnique.mockResolvedValue(buildSession({ userId: 'autre-user' }));

      await expect(service.revokeSession('user-1', 'session-1')).rejects.toThrow(
        'Session introuvable.',
      );
      expect(prisma.userSession.update).not.toHaveBeenCalled();
    });
  });

  describe('requestPhoneChange', () => {
    it('refuse si le nouveau numéro appartient déjà à un autre compte', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'autre-user' }));

      await expect(
        service.requestPhoneChange('user-1', '+22891234567', '127.0.0.1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(otp.request).not.toHaveBeenCalled();
    });

    it("envoie l'OTP au NOUVEAU numéro quand il est libre", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestPhoneChange('user-1', '+22891234567', '127.0.0.1');

      expect(otp.request).toHaveBeenCalledWith('+22891234567', 'CHANGE_PHONE', '127.0.0.1');
    });
  });

  describe('verifyPhoneChange', () => {
    it('refuse de créer le changement quand le code OTP est invalide', async () => {
      otp.verify.mockRejectedValue(new UnauthorizedException('Code invalide ou expiré.'));

      await expect(
        service.verifyPhoneChange('user-1', '+22891234567', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('met à jour phone/phoneHash/phoneVerifiedAt une fois le code vérifié', async () => {
      otp.verify.mockResolvedValue({ id: 'otp-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue(buildUser({ phone: '+22891234567' }));

      const result = await service.verifyPhoneChange('user-1', '+22891234567', '123456');

      /* eslint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining
         imbriqué est typé `any` par @types/jest, sans danger dans une simple assertion. */
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            phone: '+22891234567',
            phoneVerifiedAt: expect.any(Date),
          }),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      expect(otp.consume).toHaveBeenCalledWith('otp-1');
      expect(result.phone).toBe('+22891234567');
    });
  });
});
