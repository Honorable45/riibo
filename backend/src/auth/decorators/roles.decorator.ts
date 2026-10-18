import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route (ou un contrôleur) à certains rôles. À combiner avec
 * `JwtAuthGuard` puis `RolesGuard` : `@UseGuards(JwtAuthGuard, RolesGuard)`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
