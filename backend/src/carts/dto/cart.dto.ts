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
} from 'class-validator';
import { MAX_LINE_QUANTITY } from '../../menu/option-selection.util';

export class AddCartItemDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ type: [String], description: 'Ids des options choisies' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optionIds?: string[];

  @ApiPropertyOptional({ description: 'Précision pour le restaurant (« sans piment »)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    description: 'Vider le panier actuel s\'il contient un autre restaurant',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  replaceCart?: boolean;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
