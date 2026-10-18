import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { DRIVER_DOCUMENT_TYPES, DriverDocumentType } from '../deliveries/drivers.service';
import { AdminDriversService } from './admin-drivers.service';
import { ListAdminRestaurantsQueryDto, RestaurantActionDto } from './dto/admin-restaurants.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(private readonly drivers: AdminDriversService) {}

  @Get()
  list(@Query() query: ListAdminRestaurantsQueryDto) {
    return this.drivers.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.drivers.getOne(id);
  }

  @Patch(':id/status')
  applyAction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RestaurantActionDto,
    @Req() req: Request,
  ) {
    return this.drivers.applyAction(admin.userId, id, dto, req.ip);
  }

  @Get(':id/documents/:type')
  async openDocument(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(Object.keys(DRIVER_DOCUMENT_TYPES))) type: DriverDocumentType,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const opening = await this.drivers.openDocument(admin.userId, id, type, req.ip);
    res.set({ 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-site' });
    if (opening.kind === 'redirect') {
      res.redirect(opening.url);
      return;
    }
    res.set({ 'Content-Type': opening.mimeType });
    return new StreamableFile(opening.stream);
  }
}
