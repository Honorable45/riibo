import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromoDiscountType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ApplyPromoDto {
  @ApiProperty({ example: 'BIENVENUE' })
  @Transform(upper)
  @IsString()
  @MaxLength(30)
  code!: string;
}

export class CreatePromoDto {
  @ApiProperty({ example: 'BIENVENUE10' })
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{3,20}$/, { message: 'Code : 3 à 20 lettres, chiffres, - ou _.' })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ enum: PromoDiscountType })
  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @ApiProperty({ description: '1-100 si PERCENT, montant en FCFA si FIXED' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  discountValue!: number;

  @ApiPropertyOptional({ description: 'Plafond de la remise (FCFA)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxDiscount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Utilisations totales (absent = illimité)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUsesPerUser?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Absent = valable dans tous les restaurants' })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class UpdatePromoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
