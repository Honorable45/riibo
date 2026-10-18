import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryType, OrderStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Le client n'envoie JAMAIS de plats, de prix, de totaux ni de statut : la
 * commande est construite à partir de son panier serveur. Il ne choisit que
 * comment il reçoit, où, et comment il paie.
 */
export class CreateOrderDto {
  @ApiProperty({ enum: DeliveryType })
  @IsEnum(DeliveryType)
  deliveryType!: DeliveryType;

  @ApiPropertyOptional({ description: 'Adresse enregistrée (livraison)' })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({ description: 'Adresse saisie à la main (livraison, sans adresse enregistrée)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'Repère pour le livreur' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateOrderDto) => o.longitude !== undefined)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateOrderDto) => o.latitude !== undefined)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Numéro joignable sur place (défaut : celui du compte)' })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro de téléphone invalide.' })
  contactPhone?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export const ORDER_SCOPES = ['active', 'past'] as const;

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: ORDER_SCOPES, description: 'active = en cours, past = terminées' })
  @IsOptional()
  @IsIn(ORDER_SCOPES)
  scope?: (typeof ORDER_SCOPES)[number];

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

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

export class ReasonDto {
  @ApiPropertyOptional({ description: 'Motif (obligatoire pour refuser/annuler côté restaurant)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
