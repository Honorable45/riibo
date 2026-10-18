import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, Patch, Post, Put, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApprovedGuard } from '../auth/guards/approved.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { MAX_IMAGE_SIZE_BYTES, UPLOAD_FIELD_LIMITS } from '../uploads/media-upload.constants';
import { DriversService, DRIVER_DOCUMENT_TYPES, DriverDocumentType } from './drivers.service';
import { AvailabilityDto, LocationDto, UpdateDriverDto } from './dto/driver.dto';

/** Profil et dossier du livreur : accessibles AVANT approbation (pour compléter le dossier). */
@ApiTags('driver')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LIVREUR')
@Controller('driver')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.getMe(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(user.userId, dto);
  }

  @Post('me/documents/:type')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('document', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES + 1024, ...UPLOAD_FIELD_LIMITS, files: 1 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(Object.keys(DRIVER_DOCUMENT_TYPES))) type: DriverDocumentType,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.drivers.uploadDocument(user.userId, type, file);
  }

  @Post('me/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.drivers.submitForReview(user.userId, req.ip);
  }

  @Put('me/availability')
  @UseGuards(ApprovedGuard)
  setAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: AvailabilityDto) {
    return this.drivers.setAvailability(user.userId, dto.online);
  }

  /** Position GPS : Redis uniquement (TTL court), jamais en base ; ~toutes les 5 s pendant une course. */
  @Post('location')
  @UseGuards(ApprovedGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  location(@CurrentUser() user: AuthenticatedUser, @Body() dto: LocationDto) {
    return this.drivers.updateLocation(user.userId, dto.latitude, dto.longitude);
  }
}
