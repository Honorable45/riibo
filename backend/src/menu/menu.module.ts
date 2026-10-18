import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { UploadsModule } from '../uploads/uploads.module';
import { MenuOwnerController } from './menu-owner.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [MenuOwnerController],
  providers: [MenuService, RestaurantAccessGuard],
  exports: [MenuService],
})
export class MenuModule {}
