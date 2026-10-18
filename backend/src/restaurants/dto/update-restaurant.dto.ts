import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Champs modifiables par un restaurant. Les champs de statut (status,
 * approvedAt...) n'y figurent volontairement pas : seul un admin y touche.
 * Un membre STAFF ne peut modifier que `isPaused` (voir RestaurantOwnerService).
 */
export class UpdateRestaurantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: '+22890000000' })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro de téléphone invalide.' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  quarter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Frais de livraison en FCFA' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50_000)
  deliveryFee?: number;

  @ApiPropertyOptional({ description: 'Minimum de commande en FCFA' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  prepTimeMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  prepTimeMax?: number;

  @ApiPropertyOptional({ description: 'Fermeture manuelle immédiate' })
  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;

  @ApiPropertyOptional({ description: 'Numéro Mobile Money de réception des paiements' })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro Mobile Money invalide.' })
  paymentAccountNumber?: string;

  @ApiPropertyOptional({ type: [String], description: 'Ids de catégories de cuisine (5 max)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  cuisineCategoryIds?: string[];
}
