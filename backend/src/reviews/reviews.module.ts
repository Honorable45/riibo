import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, RestaurantAccessGuard],
  exports: [ReviewsService],
})
export class ReviewsModule {}
