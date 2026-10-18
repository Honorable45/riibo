/** Contrôle avant envoi — le serveur revérifie la signature réelle du fichier. */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // limite du backend
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Format non accepté : JPEG, PNG ou WebP uniquement.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image trop lourde : 8 Mo maximum.';
  if (file.size === 0) return 'Fichier vide.';
  return null;
}
