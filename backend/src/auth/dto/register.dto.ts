import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Seuls ces types de compte peuvent être demandés publiquement. Le RÔLE, lui,
// est déterminé par le serveur (voir AuthService.register) — ADMIN n'est
// jamais accepté ici.
export const ACCOUNT_TYPES = ['CLIENT', 'RESTAURANT', 'LIVREUR'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export class RegisterDto {
  @ApiProperty({ enum: ACCOUNT_TYPES, example: 'CLIENT' })
  @IsIn(ACCOUNT_TYPES)
  accountType!: AccountType;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Kodjo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  // Le téléphone est l'identifiant naturel au Togo et le contact de livraison :
  // obligatoire. L'email reste optionnel (nécessaire pour la récupération de
  // mot de passe par email).
  @ApiProperty({ example: '+22890000000' })
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro de téléphone invalide.' })
  phone!: string;

  @ApiPropertyOptional({ example: 'jean@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  // bcrypt tronque silencieusement au-delà de 72 octets : on borne ici.
  @ApiProperty({ example: 'un-mot-de-passe-solide' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  // --- accountType = RESTAURANT ---
  @ApiPropertyOptional({ example: 'Chez Maman' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  restaurantName?: string;

  @ApiPropertyOptional({ example: 'Agoè, près du marché' })
  @IsOptional()
  @IsString()
  // 2 caractères minimum : « Bè » est un quartier de Lomé.
  @MinLength(2)
  @MaxLength(255)
  restaurantAddress?: string;

  // --- accountType = LIVREUR ---
  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ example: 'TG-1234-AB' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plateNumber?: string;

  @ApiPropertyOptional({ example: 'Chrome sur Android' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
