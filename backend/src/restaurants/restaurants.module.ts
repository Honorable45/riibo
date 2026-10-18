import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MenuModule } from '../menu/menu.module';
import { UploadsModule } from '../uploads/uploads.module';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import { RestaurantOwnerController } from './restaurant-owner.controller';
import { RestaurantOwnerService } from './restaurant-owner.service';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

@Module({
  imports: [AuthModule, MenuModule, UploadsModule],
  controllers: [RestaurantsController, RestaurantOwnerController],
  providers: [RestaurantsService, RestaurantOwnerService, RestaurantAccessGuard],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
