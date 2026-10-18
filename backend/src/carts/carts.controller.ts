import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { ApplyPromoDto } from '../promos/dto/promo.dto';
import { CartsService } from './carts.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

/** Le panier n'appartient qu'à un CLIENT ; l'identité vient toujours du token, jamais d'un paramètre. */
@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@Controller('cart')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.getCart(user.userId);
  }

  @Post('items')
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.carts.addItem(user.userId, dto);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.carts.updateItem(user.userId, id, dto);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.carts.removeItem(user.userId, id);
  }

  @Post('promo')
  applyPromo(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyPromoDto) {
    return this.carts.applyPromo(user.userId, dto.code);
  }

  @Delete('promo')
  removePromo(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.removePromo(user.userId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.clear(user.userId);
  }
}
