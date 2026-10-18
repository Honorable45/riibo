import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { ConversationsService } from './conversations.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { UpdateConversationMembershipDto } from './dto/update-conversation-membership.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationsQueryDto) {
    return this.conversations.listMine(user.userId, query);
  }

  /**
   * Ouvre (ou retrouve) la conversation de support de l'utilisateur. C'est la
   * SEULE conversation qu'un client peut initier : les conversations de commande
   * sont créées par le serveur, jamais à la demande d'un client.
   */
  @Post('support')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  openSupport(@CurrentUser() user: AuthenticatedUser) {
    return this.conversations.ensureSupportConversation(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversations.findById(user.userId, id);
  }

  @Patch(':id')
  updateMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationMembershipDto,
  ) {
    return this.conversations.updateMembership(user.userId, id, dto);
  }
}
