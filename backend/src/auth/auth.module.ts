import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { WebsocketModule } from '../websocket/websocket.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail/mail.service';
import { OtpService } from './otp/otp.service';
import { SmsService } from './sms/sms.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // JwtModule.register({}) sans secret par défaut : access et refresh tokens
  // utilisent chacun leur propre secret, passé explicitement à chaque
  // sign/verify dans AuthService (voir JWT_ACCESS_SECRET / JWT_REFRESH_SECRET).
  // PassportModule doit être enregistré via .register() : la forme non
  // configurée ne fournit pas AuthModuleOptions, dont AuthGuard('jwt') a besoin.
  // WebsocketModule : EventsGateway.emitToUser (révocation de session en
  // temps réel, voir AuthController.revokeSession) — aucun cycle, ni
  // WebsocketModule ni PresenceModule n'importent AuthModule.
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    WebsocketModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    MailService,
    OtpService,
    SmsService,
  ],
  // PassportModule est ré-exporté pour que tout module utilisant
  // `JwtAuthGuard` (protéger ses propres routes) n'ait qu'à importer
  // AuthModule, plutôt que de redéclarer PassportModule.register() partout.
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
