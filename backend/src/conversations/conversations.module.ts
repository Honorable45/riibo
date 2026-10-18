import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  // AuthModule fournit AuthModuleOptions, requis par JwtAuthGuard.
  imports: [AuthModule, PresenceModule, WebsocketModule, NotificationsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  // Exporté : OrdersService / DeliveriesService créent les conversations de commande.
  exports: [ConversationsService],
})
export class ConversationsModule {}
