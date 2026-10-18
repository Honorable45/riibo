import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { IsPushEndpoint } from '../push-endpoint.util';

class PushSubscriptionKeysDto {
  // Clé publique ECDH P-256 (65 octets → 87 caractères base64url) et secret
  // d'authentification (16 octets → 22 caractères) : formes exactes, bornées.
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{80,100}$/, { message: 'Clé p256dh invalide.' })
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,24}$/, { message: 'Clé auth invalide.' })
  auth!: string;
}

/** Forme exacte de `PushSubscriptionJSON` (résultat de `subscription.toJSON()` côté navigateur). */
export class SubscribePushDto {
  @ApiProperty()
  @IsString()
  @IsPushEndpoint()
  endpoint!: string;

  // Toujours présent dans un vrai PushSubscriptionJSON (souvent `null`) —
  // jamais utilisé côté backend, mais doit être déclaré ici : whitelist +
  // forbidNonWhitelisted (voir main.ts) rejetteraient sinon toute requête
  // réelle de navigateur avec un 400 "property should not exist".
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
