import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerRequestStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Retire espaces, points et tirets ; un numéro local à 8 chiffres reçoit l'indicatif du Togo. */
export const normalizeTogoPhone = (raw: unknown) => {
  if (typeof raw !== 'string') return raw;
  const compact = raw.replace(/[\s.\-()]/g, '');
  if (/^\d{8}$/.test(compact)) return `+228${compact}`;
  if (/^00\d+$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
};

export class CreatePartnerRequestDto {
  @ApiProperty({ example: 'Chez Maman' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  restaurantName!: string;

  @ApiProperty({ example: 'Akouvi Mensah' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  contactName!: string;

  @ApiProperty({ example: '+22890000000' })
  @Transform(({ value }) => normalizeTogoPhone(value))
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Numéro de téléphone invalide.' })
  phone!: string;

  @ApiProperty({ example: 'Lomé, Agoè' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  area!: string;

  @ApiPropertyOptional({ example: 'Grillades, cuisine togolaise' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  cuisine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  message?: string;

  /** Champ piège invisible pour les humains : doit rester vide. */
  @ApiPropertyOptional({ description: 'Laisser vide.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class ListPartnerRequestsQueryDto {
  @ApiPropertyOptional({ enum: PartnerRequestStatus })
  @IsOptional()
  @IsEnum(PartnerRequestStatus)
  status?: PartnerRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdatePartnerRequestDto {
  @ApiProperty({ enum: PartnerRequestStatus })
  @IsEnum(PartnerRequestStatus)
  status!: PartnerRequestStatus;

  @ApiPropertyOptional({ description: 'Note interne (jamais transmise au restaurant)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  internalNote?: string;
}
