import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const RESTAURANT_SORTS = ['nearest', 'rating', 'popular'] as const;
export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

export class ListRestaurantsQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'Slug de catégorie de cuisine (poulet, riz...)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ description: 'Uniquement les restaurants ouverts maintenant' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ description: 'Latitude du client (avec longitude) pour trier par distance' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: RESTAURANT_SORTS })
  @IsOptional()
  @IsIn(RESTAURANT_SORTS)
  sort?: RestaurantSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}
