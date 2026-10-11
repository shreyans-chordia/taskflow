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
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), verifyLogin: vi.fn(), resendCode: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() },
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

  const challenge = { otpRequired: true as const, email: 's•••••••e@example.com', expiresInSec: 600, resendInSec: 60 };
  const me = { id: '1', name: 'Shreyans', email: 's@example.com', createdAt: '' };

  async function reachCodeStep(c = challenge) {
    mocked.login.mockResolvedValue(c);
    renderScreen('signin');
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Deskbound#7');
    await userEvent.click(screen.getByRole('button', { name: 'Open my desk' }));
    await screen.findByRole('heading', { name: 'Check your email' });
  }

  it('asks for the emailed code after the password, then signs in with it (AUTH-6)', async () => {
    mocked.verifyLogin.mockResolvedValue({ user: me, csrfToken: 't' });
    await reachCodeStep();
    expect(screen.getByText(/We sent a 6-digit code to s•••••••e@example.com/)).toBeInTheDocument();
    expect(screen.getByText('resend in')).toBeInTheDocument();
    const code = screen.getByLabelText('6-digit code');
    expect(code).toHaveFocus();
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await userEvent.type(code, '12a3-456');
    expect(code).toHaveValue('123456'); // only digits are kept
    await userEvent.click(screen.getByRole('button', { name: 'Verify and open my desk' }));
    expect(mocked.verifyLogin).toHaveBeenCalledWith('123456');
  });

  it('checks the code length before calling the API', async () => {
    await reachCodeStep();
    await userEvent.type(screen.getByLabelText('6-digit code'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and open my desk' }));
    expect(screen.getByText('The code has 6 digits.')).toBeInTheDocument();
    expect(mocked.verifyLogin).not.toHaveBeenCalled();
  });

  it('shows a wrong code under the field, with the tries left', async () => {
    mocked.verifyLogin.mockRejectedValue(new ApiError(401, 'OTP_INVALID', 'x', { code: 'That code is not right. 4 tries left.' }));
    await reachCodeStep();
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and open my desk' }));
    expect(await screen.findByText('That code is not right. 4 tries left.')).toBeInTheDocument();
  });

  it('goes back to sign-in when the code has expired', async () => {
    mocked.verifyLogin.mockRejectedValue(new ApiError(401, 'OTP_EXPIRED', 'That code has expired or had too many wrong tries. Start again to get a new one.'));
    await reachCodeStep();
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and open my desk' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/expired/);
    expect(screen.getByLabelText('Password')).toHaveValue(''); // typed again, never kept
  });

  it('sends a new code once the wait is over', async () => {
    mocked.resendCode.mockResolvedValue({ expiresInSec: 600, resendInSec: 60 });
    await reachCodeStep({ ...challenge, resendInSec: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'send a new code' }));
    expect(mocked.resendCode).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('A new code is on its way.');
    expect(screen.getByText('resend in')).toBeInTheDocument();
  });

  it('resets a forgotten password with an emailed code and opens the desk (AUTH-8, AUTH-9)', async () => {
    mocked.forgotPassword.mockResolvedValue(challenge);
    mocked.resetPassword.mockResolvedValue({ user: me, csrfToken: 't' });
    renderScreen('signin');
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('s@example.com'); // carried over
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(mocked.forgotPassword).toHaveBeenCalledWith('s@example.com');

    await screen.findByRole('heading', { name: 'Choose a new password' });
    await userEvent.type(screen.getByLabelText('6-digit code'), '654321');
    await userEvent.type(screen.getByLabelText('New password'), 'Brand-new#Pass9');
    expect(screen.getByText('Strong password')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save and open my desk' }));
    expect(mocked.resetPassword).toHaveBeenCalledWith({ code: '654321', password: 'Brand-new#Pass9' });
  });

  it('needs both the code and a long enough new password', async () => {
    mocked.forgotPassword.mockResolvedValue(challenge);
    renderScreen('signin');
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.type(screen.getByLabelText('Email'), 's@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Save and open my desk' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Two things need a look');
    expect(mocked.resetPassword).not.toHaveBeenCalled();
  });
});
