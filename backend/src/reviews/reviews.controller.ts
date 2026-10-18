import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { CreateReviewDto, ListReviewsQueryDto, ReplyReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Avis publics d'un restaurant approuvé (sans compte). */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('restaurants/:idOrSlug/reviews')
  listPublic(@Param('idOrSlug') idOrSlug: string, @Query() query: ListReviewsQueryDto) {
    return this.reviews.listPublic(idOrSlug, query.cursor, query.limit);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders/:orderId/review')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.userId, orderId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
  @Roles('RESTAURANT')
  @Get('restaurant/:restaurantId/reviews')
  listForOwner(@Param('restaurantId') restaurantId: string, @Query() query: ListReviewsQueryDto) {
    return this.reviews.listForRestaurant(restaurantId, query.cursor, query.limit);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
  @Roles('RESTAURANT')
  @Post('restaurant/:restaurantId/reviews/:reviewId/reply')
  reply(
    @Param('restaurantId') restaurantId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviews.reply(restaurantId, reviewId, dto.reply);
  }
}
