import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  RestaurantAccessGuard,
  RestaurantOperational,
  RestaurantRequest,
} from '../restaurants/restaurant-access.guard';
import { ListOrdersQueryDto, ReasonDto } from './dto/order.dto';
import { OrderAction } from './order-transitions';
import { RestaurantOrdersService } from './restaurant-orders.service';

// RestaurantOperational : réservé aux restaurants APPROUVÉS. Un restaurant en
// attente ou suspendu ne voit ni ne traite aucune commande.
@ApiTags('restaurant-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
@Roles('RESTAURANT')
@RestaurantOperational()
@Controller('restaurant/:restaurantId')
export class RestaurantOrdersController {
  constructor(private readonly orders: RestaurantOrdersService) {}

  @Get('dashboard')
  dashboard(@Param('restaurantId') restaurantId: string) {
    return this.orders.dashboard(restaurantId);
  }

  @Get('orders')
  list(@Param('restaurantId') restaurantId: string, @Query() query: ListOrdersQueryDto) {
    return this.orders.list(restaurantId, query);
  }

  @Post('orders/:orderId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string) {
    return this.act(req, orderId, 'ACCEPT');
  }

  @Post('orders/:orderId/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string, @Body() dto: ReasonDto) {
    return this.act(req, orderId, 'REJECT', dto.reason);
  }

  @Post('orders/:orderId/start-preparing')
  @HttpCode(HttpStatus.OK)
  startPreparing(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string) {
    return this.act(req, orderId, 'START_PREPARING');
  }

  @Post('orders/:orderId/ready')
  @HttpCode(HttpStatus.OK)
  ready(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string) {
    return this.act(req, orderId, 'MARK_READY');
  }

  /** Retrait sur place uniquement : le client vient chercher sa commande. */
  @Post('orders/:orderId/hand-over')
  @HttpCode(HttpStatus.OK)
  handOver(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string) {
    return this.act(req, orderId, 'HAND_OVER');
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: RestaurantRequest & Request, @Param('orderId') orderId: string, @Body() dto: ReasonDto) {
    return this.act(req, orderId, 'CANCEL', dto.reason);
  }

  /**
   * L'appartenance de la commande AU restaurant de l'URL est revérifiée : un
   * membre du restaurant A ne peut pas agir sur une commande du restaurant B en
   * glissant son identifiant dans une URL qu'il a le droit d'appeler.
   */
  private async act(req: RestaurantRequest & Request, orderId: string, action: OrderAction, reason?: string) {
    await this.orders.assertBelongsToRestaurant(orderId, req.restaurantMember.restaurantId);
    return this.orders.act(req.user.userId, orderId, action, reason, req.ip);
  }
}
