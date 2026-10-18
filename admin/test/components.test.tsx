import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from '@/components/confirm';
import { DishImage } from '@/components/dish-image';
import { AdminGate } from '@/components/session';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('AdminGate', () => {
  it('n’affiche rien à un compte non administrateur et révoque sa session', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/users/me')
        ? new Response(JSON.stringify({ id: 'u1', role: 'CLIENT', firstName: 'Jean', lastName: '' }), { status: 200 })
        : new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AdminGate>contenu secret</AdminGate>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/connexion?refuse=1'));
    expect(screen.queryByText('contenu secret')).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/auth/logout'))).toBe(true);
  });

  it('affiche le backoffice à un administrateur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'a1', role: 'ADMIN', firstName: 'Ama', lastName: '' }), { status: 200 })),
    );
    wrap(<AdminGate>tableau de bord</AdminGate>);
    expect(await screen.findByText('tableau de bord')).toBeTruthy();
  });
});

describe('Confirmation motivée', () => {
  function Trigger({ onConfirm }: { onConfirm: (r: string) => Promise<unknown> }) {
    const confirm = useConfirm();
    return (
      <button onClick={() => confirm({ title: 'Annuler ?', confirmLabel: 'Confirmer', reason: { label: 'Motif' }, onConfirm })}>
        ouvrir
      </button>
    );
  }

  it('n’envoie rien sans motif, puis transmet le motif saisi', async () => {
    // jsdom ne fournit pas showModal.
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    wrap(<Trigger onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('ouvrir'));
    const submit = await screen.findByRole('button', { name: 'Confirmer' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Client injoignable' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Client injoignable'));
  });

  it('affiche l’erreur du serveur sans fermer la fenêtre', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    const { ApiError } = await import('@/lib/api');
    wrap(<Trigger onConfirm={() => Promise.reject(new ApiError('conflict', 'Action impossible : la commande est « DELIVERED ».'))} />);
    fireEvent.click(screen.getByText('ouvrir'));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Action impossible : la commande est « DELIVERED ».');
  });
});

describe('DishImage', () => {
  it('repli explicite quand il n’y a pas d’image', () => {
    render(<DishImage src={null} alt="Riz gras" />);
    expect(screen.getByLabelText('Sans image')).toBeTruthy();
  });

  it('signale une image introuvable', () => {
    const onBroken = vi.fn();
    render(<DishImage src="/api/v1/media/menu/absente.jpg" alt="Tiramisu" onBroken={onBroken} />);
    fireEvent.error(screen.getByAltText('Tiramisu'));
    expect(onBroken).toHaveBeenCalled();
    expect(screen.getByLabelText('Image introuvable')).toBeTruthy();
  });
});
