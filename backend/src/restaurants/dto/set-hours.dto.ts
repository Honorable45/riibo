import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { HH_MM } from '../restaurant-hours.util';

export class HoursRangeDto {
  @ApiProperty({ description: 'ISO 8601 : 1 = lundi … 7 = dimanche', minimum: 1, maximum: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @ApiProperty({ example: '08:00' })
  @Matches(HH_MM, { message: 'Heure attendue au format HH:mm.' })
  opensAt!: string;

  @ApiProperty({ example: '22:00', description: 'Une fermeture ≤ ouverture passe minuit ; 00:00→00:00 = 24 h' })
  @Matches(HH_MM, { message: 'Heure attendue au format HH:mm.' })
  closesAt!: string;
}

/** Remplace TOUS les horaires du restaurant. Plusieurs plages par jour = service coupé. Aucune plage un jour = fermé ce jour-là. */
export class SetHoursDto {
  @ApiProperty({ type: [HoursRangeDto] })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => HoursRangeDto)
  ranges!: HoursRangeDto[];
}
