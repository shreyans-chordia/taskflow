import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { AuthProvider } from './AuthProvider';
import { AuthScreen } from './AuthScreen';
import { passwordScore } from './password';

vi.mock('../api/endpoints', () => ({
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), logout: vi.fn() },
}));
const mocked = vi.mocked(authApi);

function renderScreen(mode?: 'signup' | 'signin') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <AuthScreen initialMode={mode} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('password strength', () => {
  it('scores one point per rule met', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('desk1234')).toBe(2);
    expect(passwordScore('Deskbound7')).toBe(3);
    expect(passwordScore('Deskbound#7')).toBe(4);
  });
});

describe('<AuthScreen>', () => {
  beforeEach(() => {
    mocked.me.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'no'));
  });

  it('shows every problem at once, with a summary, and does not call the API', async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText('Email'), 'nope');
    await userEvent.type(screen.getByLabelText('Password'), 'desk');
    await userEvent.click(screen.getByRole('button', { name: 'Create my desk' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Three things need a look');
    expect(screen.getByText('Tell us what to call you.')).toBeInTheDocument();
    expect(screen.getByText('4 characters. Use at least 8.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(mocked.signup).not.toHaveBeenCalled();
  });

  it('updates the strength Ring as you type', async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText('Password'), 'Deskbound7');
    expect(screen.getByText('Good password')).toBeInTheDocument();
  });

  it('signs up and shows the "desk is ready" moment', async () => {
    mocked.signup.mockResolvedValue({ user: { id: '1', name: 'Shreyans', email: 's@example.com', createdAt: '' }, csrfToken: 't' });
    renderScreen();
    await userEvent.type(screen.getByLabelText('Your name'), 'Shreyans');
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Deskbound#7');
    await userEvent.click(screen.getByRole('button', { name: 'Create my desk' }));
    expect(await screen.findByRole('heading', { name: /Your desk is ready/ })).toBeInTheDocument();
    expect(mocked.signup).toHaveBeenCalledWith({ name: 'Shreyans', email: 's@example.com', password: 'Deskbound#7' });
  });

  it('offers to sign in when the email already has an account', async () => {
    mocked.signup.mockRejectedValue(new ApiError(409, 'CONFLICT', 'This email already has a desk.', { email: 'x' }));
    renderScreen();
    await userEvent.type(screen.getByLabelText('Your name'), 'S');
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Deskbound#7');
    await userEvent.click(screen.getByRole('button', { name: 'Create my desk' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in instead' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows the server message when sign-in fails', async () => {
    mocked.login.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Email or password is incorrect.'));
    renderScreen('signin');
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Open my desk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });
});
