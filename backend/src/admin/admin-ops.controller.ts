import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { MAX_IMAGE_SIZE_BYTES, UPLOAD_FIELD_LIMITS } from '../uploads/media-upload.constants';
import { AdminInsightsService } from './admin-insights.service';
import { AdminMenuService } from './admin-menu.service';
import { AdminOrdersService } from './admin-orders.service';
import {
  AdminCancelOrderDto,
  AdminUpdateItemDto,
  FinanceQueryDto,
  ListAdminItemsQueryDto,
  ListAdminOrdersQueryDto,
  ListAuditLogsQueryDto,
  ListPaymentsQueryDto,
} from './dto/admin-ops.dto';

// Toutes ces routes exigent un compte ADMIN actif, relu en base à chaque requête.

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: ListAdminOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.getOne(id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdminCancelOrderDto,
    @Req() req: Request,
  ) {
    return this.orders.cancel(admin.userId, id, dto.reason, req.ip);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminMenuController {
  constructor(private readonly menu: AdminMenuService) {}

  @Get('menu-items')
  list(@Query() query: ListAdminItemsQueryDto) {
    return this.menu.list(query);
  }

  @Get('menu-items/:id')
  getOne(@Param('id') id: string) {
    return this.menu.getOne(id);
  }

  @Patch('menu-items/:id')
  setAvailability(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdminUpdateItemDto,
    @Req() req: Request,
  ) {
    return this.menu.setAvailability(admin.userId, id, dto, req.ip);
  }

  @Post('menu-items/:id/image')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES + 1024, ...UPLOAD_FIELD_LIMITS, files: 1 },
    }),
  )
  setImage(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.menu.setImage(admin.userId, id, file, req.ip);
  }

  @Delete('menu-items/:id/image')
  removeImage(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.menu.removeImage(admin.userId, id, req.ip);
  }

  @Get('restaurants/:id/menu')
  restaurantMenu(@Param('id') id: string) {
    return this.menu.restaurantMenu(id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminInsightsController {
  constructor(private readonly insights: AdminInsightsService) {}

  @Get('finance')
  finance(@Query() query: FinanceQueryDto) {
    return this.insights.finance(query.from, query.to);
  }

  @Get('payments')
  payments(@Query() query: ListPaymentsQueryDto) {
    return this.insights.payments(query);
  }

  @Get('restaurants/:id/insights')
  restaurant(@Param('id') id: string) {
    return this.insights.restaurantInsights(id);
  }

  @Get('drivers/:id/insights')
  driver(@Param('id') id: string) {
    return this.insights.driverInsights(id);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.insights.user(id);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.insights.auditLogs(query);
  }

  @Get('config')
  config() {
    return this.insights.config();
  }
}
