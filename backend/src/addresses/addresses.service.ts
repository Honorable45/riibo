import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

const MAX_ADDRESSES = 10;

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException(`Vous pouvez enregistrer ${MAX_ADDRESSES} adresses au maximum.`);
    }
    // La première adresse devient la valeur par défaut.
    const isDefault = dto.isDefault === true || count === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? 'AUTRE',
          customLabel: dto.customLabel?.trim(),
          fullAddress: dto.fullAddress.trim(),
          quarter: dto.quarter?.trim(),
          landmark: dto.landmark?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault,
        },
      });
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.require(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          label: dto.label,
          customLabel: dto.customLabel?.trim(),
          fullAddress: dto.fullAddress?.trim(),
          quarter: dto.quarter?.trim(),
          landmark: dto.landmark?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async remove(userId: string, addressId: string): Promise<void> {
    const address = await this.require(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
    // Si l'adresse par défaut disparaît, la plus récente prend le relais.
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  /** 404 pour l'adresse d'un autre utilisateur : jamais d'accès par identifiant deviné. */
  async require(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Adresse introuvable.');
    return address;
  }
}
