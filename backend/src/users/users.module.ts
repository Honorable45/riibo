import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PresenceModule } from '../presence/presence.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule fournit AuthModuleOptions, requis par JwtAuthGuard (voir le
  // commentaire dans auth.module.ts).
  imports: [AuthModule, ProfilesModule, PresenceModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
