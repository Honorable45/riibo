import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AdminService } from './admin.service';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { AdminUserStatusDto, ListAdminUsersQueryDto } from './dto/admin-ops.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';

// Toutes les routes ci-dessous exigent un compte ADMIN actif — voir
// AdminGuard (relit toujours role/isActive en base, jamais depuis le JWT).
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  getMetrics() {
    return this.admin.getMetrics();
  }

  @Get('overview')
  getOverview() {
    return this.admin.getOverview();
  }

  @Get('users')
  listUsers(@Query() query: ListAdminUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id')
  updateUserStatus(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AdminUserStatusDto,
    @Req() req: Request,
  ) {
    return this.admin.updateUserStatus(admin.userId, id, dto, req.ip);
  }

  @Get('reports')
  listReports(@Query() query: ListReportsQueryDto) {
    return this.admin.listReports(query);
  }

  @Patch('reports/:id')
  resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.admin.resolveReport(user.userId, id, dto);
  }
}
