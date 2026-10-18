import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Poulet' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}

export class UpdateMenuCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Poulet braisé' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ description: 'Prix en FCFA', example: 2500 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Stock restant ; absent = illimité' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  stock?: number | null;

  @ApiPropertyOptional({ description: 'Quantité maximale par commande' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxQuantity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @ApiPropertyOptional({ description: 'null = retirer du classement' })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'null = stock illimité' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  stock?: number | null;

  @ApiPropertyOptional({ description: 'null = pas de limite' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxQuantity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;
}

export class OptionDto {
  @ApiProperty({ example: 'Frites' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ description: 'Supplément en FCFA (0 = inclus)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  priceDelta?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class OptionGroupDto {
  @ApiProperty({ example: 'Accompagnement' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ description: 'Nombre minimum de choix (0 = facultatif)', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  minSelect!: number;

  @ApiProperty({ description: 'Nombre maximum de choix', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxSelect!: number;

  @ApiProperty({ type: [OptionDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options!: OptionDto[];
}

/** Remplace TOUS les groupes d'options d'un plat (options + variations). */
export class SetOptionGroupsDto {
  @ApiProperty({ type: [OptionGroupDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OptionGroupDto)
  groups!: OptionGroupDto[];
}
