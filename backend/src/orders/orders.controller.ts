import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateOrderDto, ListOrdersQueryDto, ReasonDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Construit la commande depuis le panier serveur — le corps ne contient ni plat, ni prix, ni statut. */
  @Post()
  @Roles('CLIENT')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }

  @Get()
  @Roles('CLIENT')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListOrdersQueryDto) {
    return this.orders.listMine(user.userId, query);
  }

  /** Détail filtré selon le rôle : client, restaurant, livreur assigné ou admin. Autrement 404. */
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.getOne({ userId: user.userId, role: user.role }, id);
  }

  @Post(':id/cancel')
  @Roles('CLIENT')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.orders.cancel(user.userId, id, dto.reason);
  }

  @Post(':id/reorder')
  @Roles('CLIENT')
  @HttpCode(HttpStatus.OK)
  reorder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.reorder(user.userId, id);
  }
}
