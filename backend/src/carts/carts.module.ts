import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PromosModule } from '../promos/promos.module';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';

@Module({
  imports: [AuthModule, PromosModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
