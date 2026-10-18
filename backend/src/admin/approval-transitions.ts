import type { ApprovalStatus } from '@prisma/client';
import type { RestaurantAction } from './dto/admin-restaurants.dto';

/**
 * Transitions d'approbation (restaurants ET livreurs). Le statut n'est JAMAIS écrit directement
 * depuis une valeur du client : seule une action nommée, valide depuis
 * l'état actuel, le fait évoluer.
 */
export const APPROVAL_TRANSITIONS: Record<
  RestaurantAction,
  { from: ApprovalStatus[]; to: ApprovalStatus; needsReason: boolean }
> = {
  START_REVIEW: { from: ['PENDING'], to: 'IN_REVIEW', needsReason: false },
  APPROVE: { from: ['PENDING', 'IN_REVIEW'], to: 'APPROVED', needsReason: false },
  REJECT: { from: ['PENDING', 'IN_REVIEW'], to: 'REJECTED', needsReason: true },
  SUSPEND: { from: ['APPROVED'], to: 'SUSPENDED', needsReason: true },
  REACTIVATE: { from: ['SUSPENDED'], to: 'APPROVED', needsReason: false },
};

