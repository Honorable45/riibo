import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ListAdminRestaurantsQueryDto {
  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

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

export const RESTAURANT_ACTIONS = [
  'START_REVIEW',
  'APPROVE',
  'REJECT',
  'SUSPEND',
  'REACTIVATE',
] as const;
export type RestaurantAction = (typeof RESTAURANT_ACTIONS)[number];

export class RestaurantActionDto {
  @ApiProperty({ enum: RESTAURANT_ACTIONS })
  @IsIn(RESTAURANT_ACTIONS)
  action!: RestaurantAction;

  @ApiPropertyOptional({ description: 'Obligatoire pour REJECT et SUSPEND ; montré au restaurant' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
