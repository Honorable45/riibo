import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressLabel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({ enum: AddressLabel, default: 'AUTRE' })
  @IsOptional()
  @IsEnum(AddressLabel)
  label?: AddressLabel;

  @ApiPropertyOptional({ description: 'Nom libre quand label = AUTRE', example: 'Chez ma tante' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customLabel?: string;

  @ApiProperty({ example: 'Agoè, rue du marché' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullAddress!: string;

  @ApiPropertyOptional({ example: 'Agoè' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  quarter?: string;

  @ApiPropertyOptional({ description: 'Repère pour le livreur', example: 'Portail bleu, face à la pharmacie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  // Position facultative (saisie manuelle possible sans GPS). Les deux vont ensemble.
  @ApiPropertyOptional()
  @ValidateIf((o: CreateAddressDto) => o.longitude !== undefined)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateAddressDto) => o.latitude !== undefined)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ enum: AddressLabel })
  @IsOptional()
  @IsEnum(AddressLabel)
  label?: AddressLabel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  quarter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: UpdateAddressDto) => o.longitude !== undefined)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @ValidateIf((o: UpdateAddressDto) => o.latitude !== undefined)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
