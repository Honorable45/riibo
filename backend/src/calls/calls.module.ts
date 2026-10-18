import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { CallsController } from './calls.controller';
import { CallsGateway } from './calls.gateway';
import { CallsService } from './calls.service';

@Module({
  // Ni forwardRef() ni WebsocketModule ici : CallsGateway authentifie ses
  // propres sockets (namespace "/calls", voir socket-auth.util) et ne dépend
  // jamais d'EventsGateway. PushModule importé directement : CallsService a
  // besoin de PushProvider.sendCallInvite ET FcmProvider.sendCallInvite.
  imports: [
    AuthModule, // JwtAuthGuard pour CallsController
    JwtModule.register({}), // tokens WebSocket + jetons d'action d'appel (secret passé explicitement)
    NotificationsModule,
    PushModule,
  ],
  controllers: [CallsController],
  providers: [CallsService, CallsGateway],
  exports: [CallsService],
})
export class CallsModule {}
