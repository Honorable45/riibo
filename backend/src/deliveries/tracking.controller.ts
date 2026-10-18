import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import {
  RestaurantAccessGuard,
  RestaurantOperational,
} from '../restaurants/restaurant-access.guard';
import { DeliveriesService } from './deliveries.service';

/** Suivi d'une commande : client, restaurant, livreur assigné ou admin — sinon 404. */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderTrackingController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deliveries.getTracking({ userId: user.userId, role: user.role }, id);
  }
}

@ApiTags('restaurant-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
@Roles('RESTAURANT')
@RestaurantOperational()
@Controller('restaurant/:restaurantId/orders')
export class RestaurantDeliveryController {
  constructor(private readonly deliveries: DeliveriesService) {}

  /** Aucun livreur trouvé : le restaurant relance la recherche. */
  @Post(':orderId/retry-delivery')
  @HttpCode(HttpStatus.OK)
  retry(@Param('restaurantId') restaurantId: string, @Param('orderId') orderId: string) {
    return this.deliveries.retrySearch(restaurantId, orderId);
  }
}
