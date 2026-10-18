import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CODE_LENGTH } from '../delivery.constants';

export class UpdateDriverDto {
  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ example: 'TG-1234-AB' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleBrand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleColor?: string;

  @ApiPropertyOptional({ description: 'Numéro Mobile Money de réception des gains' })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro Mobile Money invalide.' })
  mobileMoneyNumber?: string;
}

export class AvailabilityDto {
  @ApiProperty({ description: 'true = je suis en ligne et je veux des courses' })
  @IsBoolean()
  online!: boolean;
}

export class LocationDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;
}

export class CodeDto {
  @ApiProperty({ example: '482913', description: `Code à ${CODE_LENGTH} chiffres` })
  @Matches(new RegExp(`^[0-9]{${CODE_LENGTH}}$`), { message: `Le code contient ${CODE_LENGTH} chiffres.` })
  code!: string;
}

export class ReleaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason?: string;
}

export class ListHistoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
