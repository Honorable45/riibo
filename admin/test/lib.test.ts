import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl } from '@/lib/api';
import { fcfa, plural } from '@/lib/format';
import { validateImageFile } from '@/lib/image';
import { isValidPeriod, presetPeriod, toRange } from '@/lib/period';
import { validatePromo, type PromoForm } from '@/lib/promo';

const base: PromoForm = {
  code: 'rentree10',
  description: '',
  discountType: 'PERCENT',
  discountValue: '10',
  maxDiscount: '1500',
  minOrderAmount: '',
  maxUses: '100',
  maxUsesPerUser: '1',
  startsAt: '',
  expiresAt: '2026-12-31',
  restaurantId: '',
};

describe('validatePromo', () => {
  it('accepte un code complet et le normalise', () => {
    const { body } = validatePromo(base, '2026-10-18');
    expect(body).toMatchObject({ code: 'RENTREE10', discountValue: 10, maxDiscount: 1500, maxUses: 100, expiresAt: '2026-12-31T23:59:59.000Z' });
  });

  it('refuse toute remise illimitée : pas de plafond, de limite ou de fin', () => {
    const { errors, body } = validatePromo({ ...base, maxDiscount: '', maxUses: '', expiresAt: '' }, '2026-10-18');
    expect(body).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['expiresAt', 'maxDiscount', 'maxUses']);
  });

  it('refuse un pourcentage supérieur à 100 et une fin passée', () => {
    const { errors } = validatePromo({ ...base, discountValue: '150', expiresAt: '2026-01-01' }, '2026-10-18');
    expect(errors.discountValue).toMatch(/100/);
    expect(errors.expiresAt).toMatch(/passée/);
  });

  it('une remise fixe doit rester inférieure au minimum de commande', () => {
    const { errors } = validatePromo({ ...base, discountType: 'FIXED', discountValue: '5000', minOrderAmount: '3000' }, '2026-10-18');
    expect(errors.discountValue).toBeDefined();
  });

  it('refuse les codes invalides et les valeurs non entières', () => {
    const { errors } = validatePromo({ ...base, code: 'a b', discountValue: '10.5' }, '2026-10-18');
    expect(errors.code).toBeDefined();
    expect(errors.discountValue).toBeDefined();
  });
});

describe('validateImageFile', () => {
  it('accepte JPEG, PNG et WebP jusqu’à 8 Mo', () => {
    expect(validateImageFile({ type: 'image/webp', size: 8 * 1024 * 1024 })).toBeNull();
  });
  it('refuse les autres formats, les fichiers trop lourds et vides', () => {
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toMatch(/Format/);
    expect(validateImageFile({ type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 })).toMatch(/8 Mo/);
    expect(validateImageFile({ type: 'image/png', size: 0 })).toMatch(/vide/);
  });
});

describe('périodes', () => {
  it('7 jours = les 6 jours précédents + aujourd’hui, fin exclue au lendemain', () => {
    const p = presetPeriod('7d', new Date('2026-10-18T15:00:00Z'));
    expect(p).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(toRange(p)).toEqual({ from: '2026-10-12T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' });
  });
  it('refuse une période inversée ou de plus d’un an', () => {
    expect(isValidPeriod({ preset: 'custom', from: '2026-10-18', to: '2026-10-01' })).toBe(false);
    expect(isValidPeriod({ preset: 'custom', from: '2024-01-01', to: '2026-01-01' })).toBe(false);
  });
});

describe('formats', () => {
  it('montants en francs CFA et accords', () => {
    expect(fcfa(1500).replace(/\s/g, ' ')).toBe('1 500 F');
    expect(plural(1, 'dossier', 'dossiers')).toBe('1 dossier');
    expect(plural(3, 'dossier', 'dossiers')).toBe('3 dossiers');
  });
});

describe('client HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('construit les requêtes sans paramètres vides', () => {
    expect(buildUrl('/admin/orders', { q: '', status: ['PENDING', 'READY'], limit: 30, x: undefined })).toBe(
      '/api/v1/admin/orders?status=PENDING%2CREADY&limit=30',
    );
  });

  it('renouvelle la session une seule fois puis rejoue la requête', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // POST /auth/refresh
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/admin/overview')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('session expirée : erreur « unauthorized » si le renouvellement échoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}', { status: 401 })),
    );
    await expect(api('/admin/overview')).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('relaie le message français du serveur et masque les erreurs 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: { message: 'Un motif est obligatoire.' } }), { status: 400 }))
        .mockResolvedValueOnce(new Response('stack trace interne', { status: 500 })),
    );
    await expect(api('/x')).rejects.toMatchObject({ kind: 'validation', message: 'Un motif est obligatoire.' });
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.kind).toBe('server');
    expect(err.message).not.toContain('stack');
  });

  it('réseau coupé : message explicite', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/x')).rejects.toMatchObject({ kind: 'network' });
  });
});
