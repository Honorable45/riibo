import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { DOCUMENT_TYPES, DocumentType } from '../restaurants/restaurant-owner.service';
import { AdminRestaurantsService } from './admin-restaurants.service';
import { ListAdminRestaurantsQueryDto, RestaurantActionDto } from './dto/admin-restaurants.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/restaurants')
export class AdminRestaurantsController {
  constructor(private readonly restaurants: AdminRestaurantsService) {}

  @Get()
  list(@Query() query: ListAdminRestaurantsQueryDto) {
    return this.restaurants.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.restaurants.getOne(id);
  }

  @Patch(':id/status')
  applyAction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RestaurantActionDto,
    @Req() req: Request,
  ) {
    return this.restaurants.applyAction(admin.userId, id, dto, req.ip);
  }

  @Get(':id/documents/:type')
  async openDocument(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(Object.keys(DOCUMENT_TYPES))) type: DocumentType,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const opening = await this.restaurants.openDocument(admin.userId, id, type, req.ip);
    // Jamais mis en cache par un navigateur ou un proxy : pièce d'identité.
    res.set({ 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-site' });
    if (opening.kind === 'redirect') {
      res.redirect(opening.url);
      return;
    }
    res.set({ 'Content-Type': opening.mimeType });
    return new StreamableFile(opening.stream);
  }
}
