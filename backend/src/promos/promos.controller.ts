import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';
import { PromosService } from './promos.service';

@ApiTags('admin-promos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/promos')
export class AdminPromosController {
  constructor(
    private readonly promos: PromosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.promos.list();
  }

  @Post()
  async create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreatePromoDto, @Req() req: Request) {
    const promo = await this.promos.create(dto);
    await this.audit.log({
      actorId: admin.userId,
      action: 'PROMO_CREATED',
      targetType: 'PROMO',
      targetId: promo.id,
      metadata: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
        maxUses: promo.maxUses,
        restaurantId: promo.restaurantId,
      },
      ipAddress: req.ip,
    });
    return promo;
  }

  @Patch(':id')
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromoDto,
    @Req() req: Request,
  ) {
    const promo = await this.promos.update(id, dto);
    await this.audit.log({
      actorId: admin.userId,
      action: 'PROMO_UPDATED',
      targetType: 'PROMO',
      targetId: promo.id,
      metadata: {
        code: promo.code,
        changes: JSON.parse(JSON.stringify(dto)) as Record<string, string | number | boolean>,
      },
      ipAddress: req.ip,
    });
    return promo;
  }
}
