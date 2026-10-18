import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MenuService } from '../menu/menu.service';
import { ListMenuItemsQueryDto } from '../menu/dto/list-menu-items-query.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { RestaurantsService } from './restaurants.service';

/** Catalogue public : consultable sans compte (les restaurants approuvés uniquement). */
@ApiTags('restaurants')
@Controller()
export class RestaurantsController {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly menu: MenuService,
  ) {}

  @Get('restaurant-categories')
  listCategories() {
    return this.restaurants.listCategories();
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('restaurants')
  list(@Query() query: ListRestaurantsQueryDto) {
    return this.restaurants.list(query);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('restaurants/:idOrSlug')
  getOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const latitude = lat !== undefined ? Number(lat) : NaN;
    const longitude = lng !== undefined ? Number(lng) : NaN;
    const origin =
      Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
    return this.restaurants.getOne(idOrSlug, origin);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('restaurants/:idOrSlug/menu')
  getMenu(@Param('idOrSlug') idOrSlug: string) {
    return this.menu.getPublicMenu(idOrSlug);
  }

  /** Catalogue de plats tous restaurants confondus, pour l'accueil client (produits d'abord). */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('menu-items')
  listMenuItems(@Query() query: ListMenuItemsQueryDto) {
    return this.menu.listPublicItems(query);
  }
}
