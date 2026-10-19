import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerForm, validatePartner } from '@/components/partner-form';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const valid = { restaurantName: 'Chez Ama', contactName: 'Ama K.', phone: '90 12 34 56', area: 'Lomé, Bè', cuisine: '', message: '' };

describe('validatePartner', () => {
  it('accepte une demande complète, numéro local ou international', () => {
    expect(validatePartner(valid)).toEqual({});
    expect(validatePartner({ ...valid, phone: '+228 90 12 34 56' })).toEqual({});
    expect(validatePartner({ ...valid, phone: '00228-90-12-34-56' })).toEqual({});
  });
  it('signale les champs obligatoires et un numéro invalide', () => {
    expect(Object.keys(validatePartner({ ...valid, restaurantName: ' ', contactName: '', phone: '12', area: '' })).sort()).toEqual([
      'area',
      'contactName',
      'phone',
      'restaurantName',
    ]);
  });
});

describe('configuration', () => {
  it('« Commander » mène à la section application tant qu’aucune URL n’est configurée', async () => {
    const { orderHref } = await import('@/lib/config');
    expect(orderHref()).toEqual({ href: '/#application', external: false });
  });
  it('utilise l’application client dès qu’elle est configurée, et ignore une URL invalide', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLIENT_APP_URL', 'https://app.example.tg/');
    vi.stubEnv('NEXT_PUBLIC_ANDROID_APP_URL', 'javascript:alert(1)');
    const { orderHref, site } = await import('@/lib/config');
    expect(orderHref()).toEqual({ href: 'https://app.example.tg', external: true });
    expect(site.androidAppUrl).toBeNull();
  });
  it('les images du catalogue local passent par l’hôte du backend autorisé', async () => {
    vi.stubEnv('BACKEND_URL', 'https://api.example.tg');
    const { mediaSrc } = await import('@/lib/catalog');
    expect(mediaSrc('/api/v1/media/menu/a.jpg')).toBe('https://api.example.tg/api/v1/media/menu/a.jpg');
    expect(mediaSrc('https://res.cloudinary.com/x/plat.jpg')).toBe('https://res.cloudinary.com/x/plat.jpg');
    expect(mediaSrc('http://ailleurs/plat.jpg')).toBeNull();
    expect(mediaSrc(null)).toBeNull();
  });
});

describe('PartnerForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/Nom du restaurant/), { target: { value: valid.restaurantName } });
    fireEvent.change(screen.getByLabelText(/Nom du responsable/), { target: { value: valid.contactName } });
    fireEvent.change(screen.getByLabelText(/Téléphone/), { target: { value: valid.phone } });
    fireEvent.change(screen.getByLabelText(/Ville ou quartier/), { target: { value: valid.area } });
  };

  it('n’envoie rien tant que le formulaire est invalide', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PartnerForm fallbackContact={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Indiquez le nom du restaurant.')).toBeTruthy();
  });

  it('confirme uniquement après un enregistrement réussi (201), une seule requête', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
    render(<PartnerForm fallbackContact={null} />);
    fill();
    const button = screen.getByRole('button', { name: 'Envoyer ma demande' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Envoi en cours…' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Demande bien reçue.')).toBeNull();
    resolve(new Response(JSON.stringify({ id: 'p1' }), { status: 201 }));
    expect(await screen.findByText('Demande bien reçue.')).toBeTruthy();
  });

  it('affiche une erreur claire et garde la saisie si le serveur refuse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 409 })));
    render(<PartnerForm fallbackContact={<span>Contact de secours</span>} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }));
    await waitFor(() => expect(screen.getByText(/déjà en attente/)).toBeTruthy());
    expect(screen.getByText('Contact de secours')).toBeTruthy();
    expect((screen.getByLabelText(/Nom du restaurant/) as HTMLInputElement).value).toBe('Chez Ama');
  });

  it('réseau coupé : aucun faux succès', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    render(<PartnerForm fallbackContact={null} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }));
    expect(await screen.findByText(/Connexion impossible/)).toBeTruthy();
    expect(screen.queryByText('Demande bien reçue.')).toBeNull();
  });
});
