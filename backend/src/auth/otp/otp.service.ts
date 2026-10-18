import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OtpPurpose, type OtpRequest } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

const OTP_HASH_ROUNDS = 10; // plus léger que PASSWORD_SALT_ROUNDS (12) : un code à 6 chiffres expire en minutes, pas besoin du même coût.
const OTP_TTL_MS = 5 * 60 * 1000; // 5 min
const OTP_MIN_INTERVAL_MS = 45 * 1000; // anti-spam par numéro, en plus du throttle par IP au niveau du contrôleur.

/**
 * Cycle de vie générique d'un OTP à 6 chiffres envoyé par SMS (voir
 * SmsService) — partagé entre inscription, connexion et récupération de
 * PIN 2FA (voir `OtpPurpose`). Ne stocke jamais le code en clair (`codeHash`
 * uniquement, même logique que les mots de passe/refresh tokens).
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Crée une nouvelle demande et envoie le SMS — invalide implicitement
   * toute demande précédente non consommée pour ce (phone, purpose), qui ne
   * pourra plus jamais être vérifiée (voir findActive, ne lit que la plus
   * récente non consommée).
   */
  async request(phone: string, purpose: OtpPurpose, ipAddress?: string): Promise<void> {
    const previous = await this.prisma.otpRequest.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (previous && Date.now() - previous.createdAt.getTime() < OTP_MIN_INTERVAL_MS) {
      throw new BadRequestException('Veuillez patienter avant de redemander un code.');
    }
    // Invalide l'ancienne demande (si présente) — jamais deux codes valides
    // en même temps pour le même (phone, purpose).
    if (previous) {
      await this.prisma.otpRequest.update({
        where: { id: previous.id },
        data: { consumedAt: new Date() },
      });
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, OTP_HASH_ROUNDS);
    await this.prisma.otpRequest.create({
      data: {
        phone,
        purpose,
        codeHash,
        ipAddress,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    await this.sms.sendOtp(phone, code);
  }

  /**
   * Vérifie le code contre la demande active la plus récente — incrémente
   * `attempts` à chaque échec (jamais réinitialisé), rejette au-delà de
   * `maxAttempts` même si un code correct est ensuite présenté (protection
   * contre le brute-force, section 23).
   */
  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<OtpRequest> {
    const active = await this.findActive(phone, purpose);
    if (!active) throw new UnauthorizedException('Code invalide ou expiré.');
    if (active.attempts >= active.maxAttempts) {
      throw new UnauthorizedException('Trop de tentatives — redemandez un code.');
    }

    const valid = await bcrypt.compare(code, active.codeHash);
    if (!valid) {
      await this.prisma.otpRequest.update({
        where: { id: active.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Code invalide ou expiré.');
    }

    return this.prisma.otpRequest.update({
      where: { id: active.id },
      data: { verifiedAt: new Date() },
    });
  }

  /** Marque une demande vérifiée comme définitivement utilisée (fin du parcours). */
  async consume(id: string): Promise<void> {
    await this.prisma.otpRequest.update({ where: { id }, data: { consumedAt: new Date() } });
  }

  private async findActive(phone: string, purpose: OtpPurpose): Promise<OtpRequest | null> {
    return this.prisma.otpRequest.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
