import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.list(user.userId);
  }

  @Get('ids')
  ids(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.ids(user.userId);
  }

  @Post(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  add(@CurrentUser() user: AuthenticatedUser, @Param('restaurantId') restaurantId: string) {
    return this.favorites.add(user.userId, restaurantId);
  }

  @Delete(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('restaurantId') restaurantId: string) {
    return this.favorites.remove(user.userId, restaurantId);
  }
}
