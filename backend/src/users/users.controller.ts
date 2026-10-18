import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UpdateProfileDto } from '../profiles/dto/update-profile.dto';
import { ProfilesService } from '../profiles/profiles.service';
import { MAX_IMAGE_SIZE_BYTES, UPLOAD_FIELD_LIMITS } from '../uploads/media-upload.constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
  ) {}

  // Routes statiques ("me", "search") déclarées avant ":id" pour ne pas être
  // capturées par le paramètre dynamique.
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getMe(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.users.updateMe(user.userId, dto);
  }

  @Patch('me/profile')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(user.userId, dto);
  }

  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES + 1024, ...UPLOAD_FIELD_LIMITS, files: 1 },
    }),
  )
  setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.profiles.setAvatar(user.userId, file);
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.removeAvatar(user.userId);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.users.getPublicProfile(id);
  }
}
