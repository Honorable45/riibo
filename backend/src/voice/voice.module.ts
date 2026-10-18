import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [
    AuthModule,
    WebsocketModule,
    PresenceModule,
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
