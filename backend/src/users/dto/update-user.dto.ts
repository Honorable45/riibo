import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message:
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, points et underscores.",
  })
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  // Pas de champ `phone` ici (section 4 du cahier des charges) : un
  // changement de numéro doit obligatoirement passer par une nouvelle
  // vérification OTP — voir POST auth/phone/request-change puis
  // auth/phone/verify-change, jamais ce endpoint générique.
}
