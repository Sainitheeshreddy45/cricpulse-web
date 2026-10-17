import { useState } from 'react';
import { ArrowRight, UserRound, X } from 'lucide-react';
import { AUTH_TOKEN_KEY, getErrorMessage } from '../../api';
import { AUTH_USER_KEY, unwrapUser } from '../../utils/authSession';
import { authService } from '../../services/authService';
import Button from '../common/Button';

function findAuthToken(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return '';

  const messageToken = value.data?.message;
  if (typeof messageToken === 'string' && messageToken.split('.').length === 3) return messageToken;

  for (const key of ['token', 'accessToken', 'access_token', 'jwt', 'jwtToken']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }

  for (const key of ['data', 'user', 'result', 'payload', 'authentication']) {
    const token = findAuthToken(value[key], depth + 1);
    if (token) return token;
  }

  return '';
}

export default function AuthDialog({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    phoneNumber: '',
    email: '',
    identifier: '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = mode === 'login'
        ? await authService.signIn({ identifier: form.identifier.trim(), password: form.password })
        : await authService.register({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          username: form.username.trim(),
          phoneNumber: form.phoneNumber.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      const token = findAuthToken(response);
      if (!token) throw new Error('The server did not return an authentication token. Please try again.');
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      let account = unwrapUser(response);
      if (account?.message === token) {
        account = Object.fromEntries(Object.entries(account).filter(([key]) => key !== 'message'));
      }
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(account));
      onSuccess(account);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="dialog-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="dialog-icon"><UserRound size={21} /></div>
        <span className="eyebrow">YOUR CRICKET, IN ONE PLACE</span>
        <h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Join the game.'}</h2>
        <p className="dialog-subtitle">{mode === 'login' ? 'Sign in to start scoring and keep your matches.' : 'Create an account to score and save your matches.'}</p>
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' ? (
            <>
              <label>First name<input required autoComplete="given-name" value={form.firstName} onChange={update('firstName')} placeholder="e.g. Alex" /></label>
              <label>Last name<input required autoComplete="family-name" value={form.lastName} onChange={update('lastName')} placeholder="e.g. Morgan" /></label>
              <label>Username<input required autoComplete="username" value={form.username} onChange={update('username')} placeholder="Choose a username" /></label>
              <label>Phone number<input required type="tel" autoComplete="tel" value={form.phoneNumber} onChange={update('phoneNumber')} placeholder="Your mobile number" /></label>
              <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={update('email')} placeholder="you@example.com" /></label>
            </>
          ) : (
            <label>Username, phone number, or email<input required autoComplete="username" value={form.identifier} onChange={update('identifier')} placeholder="Enter any one of your account details" /></label>
          )}
          <label>Password<input required type="password" minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} placeholder="At least 6 characters" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></Button>
        </form>
        <p className="auth-switch">{mode === 'login' ? 'New to CricPulse?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </section>
    </div>
  );
}
