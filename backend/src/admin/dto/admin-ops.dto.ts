import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** `?x=true` / `?x=false` → booléen ; toute autre valeur reste invalide. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** `?status=A,B` ou `?status=A&status=B` → tableau. */
const toList = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : value;

class CursorQueryDto {
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

/** Période : bornes ISO (incluse / exclue). Sans bornes : pas de filtre. */
class PeriodQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Début (ISO 8601, inclus)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fin (ISO 8601, exclue)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListAdminOrdersQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ description: 'Numéro de commande, nom ou téléphone du client' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: OrderStatus, isArray: true })
  @IsOptional()
  @Transform(toList)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional({ enum: DeliveryType })
  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'Identifiant du profil livreur' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;
}

export class AdminCancelOrderDto {
  @ApiProperty({ description: 'Motif, visible par le client et le restaurant' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class FinanceQueryDto {
  @ApiProperty({ description: 'Début (ISO 8601, inclus)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Fin (ISO 8601, exclue)' })
  @IsDateString()
  to!: string;
}

export class ListPaymentsQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export const ITEM_ISSUES = [
  'NO_IMAGE',
  'NO_DESCRIPTION',
  'NO_CATEGORY',
  'UNAVAILABLE',
  'SOLD_OUT',
] as const;
export type ItemIssue = (typeof ITEM_ISSUES)[number];

export class ListAdminItemsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ enum: ITEM_ISSUES })
  @IsOptional()
  @IsIn(ITEM_ISSUES)
  issue?: ItemIssue;
}

export class AdminUpdateItemDto {
  @ApiProperty({ description: 'Disponibilité à la commande' })
  @IsBoolean()
  isAvailable!: boolean;

  @ApiProperty({ description: 'Motif, conservé dans le journal d’audit' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ListAuditLogsQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ description: 'Préfixe d’action, ex. ORDER_, RESTAURANT_' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ListAdminUsersQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Nom, téléphone, e-mail ou nom d’utilisateur' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUserStatusDto {
  @ApiProperty({ description: 'true pour réactiver, false pour suspendre' })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Obligatoire pour une suspension' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
