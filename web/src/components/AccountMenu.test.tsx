import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/endpoints';
import { AuthProvider } from '../auth/AuthProvider';
import { AccountMenu } from './AccountMenu';

vi.mock('../api/endpoints', () => ({
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), verifyLogin: vi.fn(), resendCode: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() },
}));

function renderMenu(extra?: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <p>Outside</p>
        <AccountMenu>{extra}</AccountMenu>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(authApi.me).mockResolvedValue({ user: { id: 'u', name: 'test_first', email: 'first@example.com', createdAt: '' }, csrfToken: 't' });
  vi.mocked(authApi.logout).mockResolvedValue(undefined as never);
});

describe('<AccountMenu>: the TaskFlow badge is the account menu', () => {
  const badge = () => screen.findByRole('button', { name: 'TaskFlow account menu, signed in as test_first' });

  it('opens to show who is signed in, and signs out from there', async () => {
    renderMenu();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    await userEvent.click(await badge());
    expect(await badge()).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('group', { name: 'Account' });
    expect(menu).toHaveTextContent('Signed in as');
    expect(menu).toHaveTextContent('test_first');
    expect(menu).toHaveTextContent('first@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authApi.logout).toHaveBeenCalledOnce());
  });

  it('closes with Escape and puts focus back on the badge', async () => {
    renderMenu();
    await userEvent.click(await badge());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Account' })).not.toBeInTheDocument();
    expect(await badge()).toHaveFocus();
    expect(await badge()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a click anywhere else, and on a second click of the badge', async () => {
    renderMenu();
    await userEvent.click(await badge());
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('group', { name: 'Account' })).not.toBeInTheDocument();
    await userEvent.click(await badge());
    await userEvent.click(await badge());
    expect(screen.queryByRole('group', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('holds extra items above Sign out (the 2D page puts the lamp there)', async () => {
    const lamp = vi.fn();
    renderMenu(<button type="button" onClick={lamp}>Lamp: light / dark</button>);
    await userEvent.click(await badge());
    await userEvent.click(screen.getByRole('button', { name: 'Lamp: light / dark' }));
    expect(lamp).toHaveBeenCalledOnce();
  });
});
