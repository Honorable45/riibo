import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminPromosController } from './promos.controller';
import { PromosService } from './promos.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminPromosController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
