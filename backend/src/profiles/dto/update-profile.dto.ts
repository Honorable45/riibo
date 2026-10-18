import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  // Accepte une URL déjà hébergée (le flux d'upload de fichier arrive avec
  // UploadsModule, phase 9 — cet endpoint ne change pas à ce moment-là, seul
  // le frontend enverra une URL fraîchement uploadée au lieu d'une URL saisie).
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl doit être une URL valide.' })
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLastSeen?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showReadReceipts?: boolean;

  // Interrupteur global (section 11). NotificationsService ne crée
  // silencieusement aucune notification tant que ceci est à false.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  // Section 9 : masque l'aperçu du message dans les notifications système
  // ("Riiberaka — Nouveau message" au lieu de "Jean : Salut...") — voir
  // push-text.util.ts, n'affecte jamais le panneau in-app.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideNotificationContent?: boolean;
}
