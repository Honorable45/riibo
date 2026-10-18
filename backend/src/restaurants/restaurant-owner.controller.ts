import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MAX_IMAGE_SIZE_BYTES, UPLOAD_FIELD_LIMITS } from '../uploads/media-upload.constants';
import { CreateClosureDto } from './dto/create-closure.dto';
import { SetHoursDto } from './dto/set-hours.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import {
  RestaurantAccessGuard,
  RestaurantRequest,
  RestaurantRole,
} from './restaurant-access.guard';
import {
  DOCUMENT_TYPES,
  DocumentType,
  IMAGE_KINDS,
  ImageKind,
  RestaurantOwnerService,
} from './restaurant-owner.service';

const IMAGE_UPLOAD = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES + 1024, ...UPLOAD_FIELD_LIMITS, files: 1 },
};

// Volontairement SANS ApprovedGuard : un restaurant en attente peut préparer son
// profil, ses horaires et son menu pendant que son dossier est vérifié.
// Les routes opérationnelles (commandes) ajouteront ApprovedGuard.
@ApiTags('restaurant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
@Roles('RESTAURANT')
@Controller('restaurant/:restaurantId')
export class RestaurantOwnerController {
  constructor(private readonly owner: RestaurantOwnerService) {}

  @Get()
  getOne(@Param('restaurantId') restaurantId: string) {
    return this.owner.getOne(restaurantId);
  }

  @Patch()
  update(@Req() req: RestaurantRequest, @Body() dto: UpdateRestaurantDto) {
    return this.owner.update(req.restaurantMember.restaurantId, req.restaurantMember.role, dto);
  }

  @Post('images/:kind')
  @RestaurantRole('OWNER')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('image', IMAGE_UPLOAD))
  setImage(
    @Param('restaurantId') restaurantId: string,
    @Param('kind', new ParseEnumPipe(Object.keys(IMAGE_KINDS))) kind: ImageKind,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.owner.setImage(restaurantId, kind, file);
  }

  @Put('hours')
  @RestaurantRole('OWNER')
  setHours(@Param('restaurantId') restaurantId: string, @Body() dto: SetHoursDto) {
    return this.owner.setHours(restaurantId, dto);
  }

  @Post('closures')
  @RestaurantRole('OWNER')
  addClosure(@Param('restaurantId') restaurantId: string, @Body() dto: CreateClosureDto) {
    return this.owner.addClosure(restaurantId, dto);
  }

  @Delete('closures/:closureId')
  @RestaurantRole('OWNER')
  removeClosure(
    @Param('restaurantId') restaurantId: string,
    @Param('closureId') closureId: string,
  ) {
    return this.owner.removeClosure(restaurantId, closureId);
  }

  @Post('documents/:type')
  @RestaurantRole('OWNER')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('document', IMAGE_UPLOAD))
  uploadDocument(
    @Param('restaurantId') restaurantId: string,
    @Param('type', new ParseEnumPipe(Object.keys(DOCUMENT_TYPES))) type: DocumentType,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.owner.uploadDocument(restaurantId, type, file);
  }

  @Post('submit')
  @RestaurantRole('OWNER')
  @HttpCode(HttpStatus.OK)
  submit(@Req() req: RestaurantRequest & Request) {
    return this.owner.submitForReview(
      req.restaurantMember.restaurantId,
      req.user.userId,
      req.ip,
    );
  }
}
