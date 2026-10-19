import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import {
  CreatePartnerRequestDto,
  ListPartnerRequestsQueryDto,
  UpdatePartnerRequestDto,
} from './dto/partner-request.dto';
import { PartnerRequestsService } from './partner-requests.service';

/** Formulaire public du site vitrine : sans compte, limité en débit. */
@ApiTags('partners')
@Controller('partner-requests')
export class PartnerRequestsController {
  constructor(private readonly requests: PartnerRequestsService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(@Body() dto: CreatePartnerRequestDto) {
    return this.requests.create(dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/partner-requests')
export class AdminPartnerRequestsController {
  constructor(private readonly requests: PartnerRequestsService) {}

  @Get()
  list(@Query() query: ListPartnerRequestsQueryDto) {
    return this.requests.list(query);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerRequestDto,
    @Req() req: Request,
  ) {
    return this.requests.update(admin.userId, id, dto, req.ip);
  }
}
