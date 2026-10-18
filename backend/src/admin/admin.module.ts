import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { UploadsModule } from '../uploads/uploads.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminInsightsService } from './admin-insights.service';
import { AdminMenuService } from './admin-menu.service';
import { AdminInsightsController, AdminMenuController, AdminOrdersController } from './admin-ops.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';
import { AdminRestaurantsController } from './admin-restaurants.controller';
import { AdminRestaurantsService } from './admin-restaurants.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// PrismaService est global (voir PrismaModule) : pas besoin de l'importer
// ici. Aucun forwardRef() nécessaire — AdminModule ne fait que consommer
// MessagesService (déjà exporté), rien ne dépend
// d'AdminModule en retour : le graphe reste un DAG.
@Module({
  imports: [AuthModule, MessagesModule, ReviewsModule, NotificationsModule, UploadsModule, DeliveriesModule, OrdersModule],
  controllers: [
    AdminController,
    AdminRestaurantsController,
    AdminDriversController,
    AdminOrdersController,
    AdminMenuController,
    AdminInsightsController,
  ],
  providers: [
    AdminService,
    AdminRestaurantsService,
    AdminDriversService,
    AdminOrdersService,
    AdminMenuService,
    AdminInsightsService,
  ],
})
export class AdminModule {}
