import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApprovedGuard } from '../auth/guards/approved.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { DeliveriesService } from './deliveries.service';
import { CodeDto, ListHistoryQueryDto, ReleaseDto } from './dto/driver.dto';

/** Offres et courses : livreur APPROUVÉ uniquement, et toujours sur SES propres courses. */
@ApiTags('driver-deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovedGuard)
@Roles('LIVREUR')
@Controller('driver')
export class DriverDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('offers')
  offers(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.listOffers(user.userId);
  }

  @Post('offers/:deliveryId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('deliveryId') deliveryId: string) {
    return this.deliveries.acceptOffer(user.userId, deliveryId);
  }

  @Post('offers/:deliveryId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(@CurrentUser() user: AuthenticatedUser, @Param('deliveryId') deliveryId: string) {
    return this.deliveries.rejectOffer(user.userId, deliveryId);
  }

  // « current » avant « :id » : sinon le paramètre dynamique l'avalerait.
  /** `{ delivery: null }` quand aucune course n'est en cours (jamais un corps vide, ambigu côté client). */
  @Get('deliveries/current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    return { delivery: await this.deliveries.getCurrent(user.userId) };
  }

  @Get('deliveries')
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: ListHistoryQueryDto) {
    return this.deliveries.history(user.userId, query.cursor, query.limit);
  }

  @Get('deliveries/:id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deliveries.getDriverDelivery(user.userId, id);
  }

  @Post('deliveries/:id/at-restaurant')
  @HttpCode(HttpStatus.OK)
  atRestaurant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deliveries.markAtRestaurant(user.userId, id);
  }

  @Post('deliveries/:id/pick-up')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pickUp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CodeDto) {
    return this.deliveries.pickUp(user.userId, id, dto.code);
  }

  @Post('deliveries/:id/arrived')
  @HttpCode(HttpStatus.OK)
  arrived(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deliveries.markArrived(user.userId, id);
  }

  @Post('deliveries/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CodeDto) {
    return this.deliveries.deliver(user.userId, id, dto.code);
  }

  @Post('deliveries/:id/release')
  @HttpCode(HttpStatus.OK)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReleaseDto) {
    return this.deliveries.release(user.userId, id, dto.reason);
  }
}
