import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PromosModule } from '../promos/promos.module';
import { CartsModule } from '../carts/carts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { WebsocketModule } from '../websocket/websocket.module';
import { MessagesModule } from '../messages/messages.module';
import { OrderChatEventsService } from './order-chat-events.service';
import { OrderStateMachineService } from './order-state-machine.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RestaurantOrdersController } from './restaurant-orders.controller';
import { RestaurantOrdersService } from './restaurant-orders.service';

@Module({
  imports: [AuthModule, CartsModule, PromosModule, ConversationsModule, MessagesModule, NotificationsModule, WebsocketModule],
  controllers: [OrdersController, RestaurantOrdersController],
  providers: [OrdersService, OrderStateMachineService, OrderChatEventsService, RestaurantOrdersService, RestaurantAccessGuard],
  // La machine à états est exportée : le module livraison (livreur) l'utilise
  // pour ASSIGN / PICK_UP / ON_THE_WAY / DELIVER — jamais d'écriture directe du statut.
  exports: [OrdersService, OrderStateMachineService],
})
export class OrdersModule {}
