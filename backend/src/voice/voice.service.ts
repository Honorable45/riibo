import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MediaStorageProvider, Prisma } from '@prisma/client';
import type { ReadStream } from 'node:fs';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  EXTENSION_TO_MIME_TYPE,
  MAX_AUDIO_SIZE_BYTES,
} from '../uploads/audio-upload.constants';
import { CloudinaryProvider } from '../uploads/cloudinary.provider';
import { matchesFileSignature } from '../uploads/file-signature.util';
import { StorageService } from '../uploads/storage.service';
import { EventsGateway } from '../websocket/events.gateway';
import { API_PREFIX } from '../common/api-prefix';
import { CreateVoiceMessageDto } from './dto/create-voice-message.dto';

const VOICE_MESSAGE_INCLUDE = {
  voiceMessage: true,
} satisfies Prisma.MessageInclude;

type MessageWithVoice = Prisma.MessageGetPayload<{ include: typeof VOICE_MESSAGE_INCLUDE }>;

function toVoiceMessageDto(message: MessageWithVoice, cloudinary: CloudinaryProvider) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    replyToId: message.replyToId,
    deletedAt: message.deletedAt,
    sentAt: message.sentAt,
    deliveredAt: message.deliveredAt,
    createdAt: message.createdAt,
    voice: message.voiceMessage
      ? {
          durationSeconds: message.voiceMessage.durationSeconds,
          waveform: message.voiceMessage.waveform,
          // CLOUDINARY : URL signée, recalculée à chaque appel (même principe
          // que MessagesService.toAttachmentDto). LOCAL : chemin proxy
          // inchangé, streamé via streamAudio.
          audioUrl:
            message.voiceMessage.audioStorageProvider === 'CLOUDINARY'
              ? cloudinary.getSignedUrl(message.voiceMessage.audioStorageKey, 'video')
              : `${API_PREFIX}/voice/${message.id}/audio`,
        }
      : null,
  };
}

export type VoiceMessageDto = ReturnType<typeof toVoiceMessageDto>;

export interface AudioStream {
  stream: ReadStream;
  mimeType: string;
  sizeBytes: number | null;
}

@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: EventsGateway,
    private readonly presence: PresenceService,
    private readonly notifications: NotificationsService,
    private readonly cloudinary: CloudinaryProvider,
  ) {}

  async send(
    userId: string,
    dto: CreateVoiceMessageDto,
    file: Express.Multer.File | undefined,
  ): Promise<VoiceMessageDto> {
    if (!file || file.size === 0) {
      throw new BadRequestException('Aucun fichier audio reçu.');
    }

    const extension = ALLOWED_AUDIO_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        `Format audio non supporté : "${file.mimetype}". Formats acceptés : ${Object.keys(ALLOWED_AUDIO_MIME_TYPES).join(', ')}.`,
      );
    }
    // Le Content-Type d'un formulaire multipart est choisi par le client et
    // ne garantit rien sur le contenu réel du fichier (audit de sécurité) —
    // on vérifie les octets de signature avant d'aller plus loin.
    if (!matchesFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        `Le contenu du fichier ne correspond pas au format déclaré ("${file.mimetype}").`,
      );
    }
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      throw new BadRequestException(
        `Le fichier audio est trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo, maximum ${
          MAX_AUDIO_SIZE_BYTES / (1024 * 1024)
        } Mo).`,
      );
    }

    await this.assertMembership(userId, dto.conversationId);
    await this.assertConversationOpen(dto.conversationId);

    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({ where: { id: dto.replyToId } });
      if (!replyTarget || replyTarget.conversationId !== dto.conversationId) {
        throw new BadRequestException(
          'Le message auquel vous répondez est introuvable dans cette conversation.',
        );
      }
    }

    const waveform = this.parseWaveform(dto.waveform);
    const stored = await this.saveAudioFile(file.buffer, extension);

    const recipients = await this.otherMemberIds(dto.conversationId, userId);
    // Même logique que MessagesService.send : "livré" dès la création si un
    // destinataire est actuellement en ligne (voir la note sur l'absence de
    // rattrapage rétroactif dans messages.service.ts).
    const deliveredAt = (await this.presence.isAnyOnline(recipients)) ? new Date() : null;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: userId,
          type: 'VOICE',
          replyToId: dto.replyToId,
          deliveredAt,
          voiceMessage: {
            create: {
              audioStorageKey: stored.key,
              audioStorageProvider: stored.provider,
              audioMimeType: file.mimetype,
              durationSeconds: dto.durationSeconds,
              waveform: waveform ?? undefined,
            },
          },
        },
        include: VOICE_MESSAGE_INCLUDE,
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const dtoOut = toVoiceMessageDto(message, this.cloudinary);
    this.events.emitToUsers(recipients, 'message:new', dtoOut);

    await Promise.all(
      recipients.map((recipientId) =>
        this.notifications.create(recipientId, 'NEW_VOICE_MESSAGE', {
          conversationId: dto.conversationId,
          messageId: message.id,
          senderId: userId,
        }),
      ),
    );

    return dtoOut;
  }

  /** Upload d'un vocal — Cloudinary si configuré, sinon le disque local comme avant (même principe que MessagesService.saveMediaFile). */
  private async saveAudioFile(
    buffer: Buffer,
    extension: string,
  ): Promise<{ key: string; provider: MediaStorageProvider }> {
    if (this.cloudinary.isConfigured()) {
      const uploaded = await this.cloudinary.upload(buffer, 'voice', 'video');
      return { key: uploaded.publicId, provider: 'CLOUDINARY' };
    }
    const stored = await this.storage.save(buffer, 'voice', extension);
    return { key: stored.key, provider: 'LOCAL' };
  }

  /** Vérifie l'appartenance à la conversation avant de streamer le fichier (section 23). */
  async streamAudio(userId: string, messageId: string): Promise<AudioStream> {
    const message = await this.findVoiceMessage(messageId);
    await this.assertMembership(userId, message.conversationId);

    if (message.voiceMessage!.audioStorageProvider !== 'LOCAL') {
      // Ne devrait jamais être atteint en usage normal : toVoiceMessageDto
      // renvoie directement l'URL Cloudinary signée pour un vocal CLOUDINARY
      // (même principe que MessagesService.streamAttachment).
      throw new NotFoundException('Ce vocal ne se sert plus par cette route.');
    }

    const key = message.voiceMessage!.audioStorageKey;
    if (!(await this.storage.exists(key))) {
      throw new NotFoundException('Fichier audio introuvable.');
    }

    const extension = key.split('.').pop() ?? '';
    return {
      stream: this.storage.createReadStream(key),
      mimeType: EXTENSION_TO_MIME_TYPE[extension] ?? 'application/octet-stream',
      sizeBytes: null,
    };
  }

  /** Suppression douce, réservée à l'auteur — même contrat que MessagesService.remove. */
  async remove(userId: string, messageId: string): Promise<VoiceMessageDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: VOICE_MESSAGE_INCLUDE,
    });
    if (!message || message.type !== 'VOICE' || !message.voiceMessage) {
      throw new NotFoundException('Message vocal introuvable.');
    }
    await this.assertMembership(userId, message.conversationId);
    if (message.senderId !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres messages.');
    }

    if (message.deletedAt) {
      return toVoiceMessageDto(message, this.cloudinary); // déjà supprimé : idempotent
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: VOICE_MESSAGE_INCLUDE,
    });

    // La ligne base fait foi (déjà marquée supprimée) même si l'effacement
    // physique échoue — StorageService.delete/CloudinaryProvider.delete ne
    // lèvent jamais (best-effort).
    if (message.voiceMessage.audioStorageProvider === 'CLOUDINARY') {
      await this.cloudinary.delete(message.voiceMessage.audioStorageKey, 'video', 'authenticated');
    } else {
      await this.storage.delete(message.voiceMessage.audioStorageKey);
    }

    const recipients = await this.otherMemberIds(message.conversationId, userId);
    this.events.emitToUsers(recipients, 'message:deleted', {
      id: updated.id,
      conversationId: updated.conversationId,
    });

    return toVoiceMessageDto(updated, this.cloudinary);
  }

  /**
   * Détails d'un vocal déjà envoyé (durée, forme d'onde, URL) — nécessaire pour
   * un message chargé depuis l'historique (`GET /conversations/:id/messages`
   * ne connaît que la table `Message` de base).
   */
  async getDetails(userId: string, messageId: string): Promise<VoiceMessageDto> {
    const message = await this.findVoiceMessage(messageId);
    await this.assertMembership(userId, message.conversationId);
    return toVoiceMessageDto(message, this.cloudinary);
  }

  private async findVoiceMessage(messageId: string): Promise<MessageWithVoice> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: VOICE_MESSAGE_INCLUDE,
    });
    if (!message || message.type !== 'VOICE' || !message.voiceMessage || message.deletedAt) {
      throw new NotFoundException('Message vocal introuvable.');
    }
    return message;
  }

  private parseWaveform(raw: string | undefined): number[] | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'number')) {
        throw new Error('not a number array');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Le champ "waveform" doit être un tableau JSON de nombres.');
    }
  }

  private async assertConversationOpen(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { closedAt: true },
    });
    if (conversation?.closedAt) {
      throw new ConflictException('Cette conversation est fermée.');
    }
  }

  private async assertMembership(userId: string, conversationId: string): Promise<void> {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership || membership.leftAt) {
      throw new NotFoundException('Conversation introuvable.');
    }
  }

  private async otherMemberIds(conversationId: string, excludeUserId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null, userId: { not: excludeUserId } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }
}
