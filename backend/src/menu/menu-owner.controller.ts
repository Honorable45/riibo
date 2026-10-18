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
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RestaurantAccessGuard } from '../restaurants/restaurant-access.guard';
import { MAX_IMAGE_SIZE_BYTES, UPLOAD_FIELD_LIMITS } from '../uploads/media-upload.constants';
import {
  CreateMenuCategoryDto,
  CreateMenuItemDto,
  SetOptionGroupsDto,
  UpdateMenuCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';
import { MenuService } from './menu.service';

// Le personnel (STAFF) gère le menu comme le propriétaire : rendre un plat
// indisponible en plein service ne doit pas attendre le gérant.
@ApiTags('restaurant-menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
@Roles('RESTAURANT')
@Controller('restaurant/:restaurantId/menu')
export class MenuOwnerController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  getMenu(@Param('restaurantId') restaurantId: string) {
    return this.menu.getOwnerMenu(restaurantId);
  }

  @Post('categories')
  createCategory(@Param('restaurantId') restaurantId: string, @Body() dto: CreateMenuCategoryDto) {
    return this.menu.createCategory(restaurantId, dto);
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menu.updateCategory(restaurantId, categoryId, dto);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.menu.deleteCategory(restaurantId, categoryId);
  }

  @Post('items')
  createItem(@Param('restaurantId') restaurantId: string, @Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(restaurantId, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(restaurantId, itemId, dto);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('restaurantId') restaurantId: string, @Param('itemId') itemId: string) {
    return this.menu.deleteItem(restaurantId, itemId);
  }

  @Post('items/:itemId/image')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES + 1024, ...UPLOAD_FIELD_LIMITS, files: 1 },
    }),
  )
  setItemImage(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.menu.setItemImage(restaurantId, itemId, file);
  }

  @Put('items/:itemId/options')
  setOptionGroups(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetOptionGroupsDto,
  ) {
    return this.menu.setOptionGroups(restaurantId, itemId, dto);
  }
}
