import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminPartnerRequestsController,
  PartnerRequestsController,
} from './partner-requests.controller';
import { PartnerRequestsService } from './partner-requests.service';

@Module({
  imports: [AuthModule],
  controllers: [PartnerRequestsController, AdminPartnerRequestsController],
  providers: [PartnerRequestsService],
})
export class PartnersModule {}
