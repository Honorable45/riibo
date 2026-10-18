import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { RedisService } from '../redis/redis.service';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { UploadsModule } from '../uploads/uploads.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { DRIVER_LOCATION_STORE } from './deliveries.tokens';
import { DeliveriesService } from './deliveries.service';
import { DispatchService } from './dispatch.service';
import { DriverDeliveriesController } from './driver-deliveries.controller';
import {
  DriverLocationStore,
  MemoryDriverLocationStore,
  RedisDriverLocationStore,
} from './driver-location.store';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { OrderTrackingController, RestaurantDeliveryController } from './tracking.controller';

@Module({
  imports: [AuthModule, OrdersModule, ConversationsModule, NotificationsModule, WebsocketModule, UploadsModule],
  controllers: [DriversController, DriverDeliveriesController, OrderTrackingController, RestaurantDeliveryController],
  providers: [
    DriversService,
    DeliveriesService,
    DispatchService,
    RestaurantAccessGuard,
    {
      provide: DRIVER_LOCATION_STORE,
      // Redis en production (position partagée entre instances), mémoire sinon.
      useFactory: (redis: RedisService): DriverLocationStore =>
        redis.client ? new RedisDriverLocationStore(redis.client) : new MemoryDriverLocationStore(),
      inject: [RedisService],
    },
  ],
  exports: [DriversService, DeliveriesService, DRIVER_LOCATION_STORE],
})
export class DeliveriesModule {}
