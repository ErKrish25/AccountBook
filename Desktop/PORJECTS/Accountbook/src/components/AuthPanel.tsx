import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@accountbook.local`;
}

function normalizeUsername(value: string): string | null {
  const cleaned = value.trim();
  if (!USERNAME_REGEX.test(cleaned)) return null;

  return cleaned.toLowerCase();
}

export function AuthPanel() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      setMessage(
        'Username must be 3-30 chars and can contain letters, numbers, dot, underscore, or hyphen.'
      );
      return;
    }
    const email = usernameToEmail(normalizedUsername);

    const action = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });

    const { data, error } = await action;
    if (error) {
      if (!isSignUp && error.message.toLowerCase().includes('invalid login credentials')) {
        setMessage('Invalid credentials. Create account first or check username/password.');
      } else {
        setMessage(error.message);
      }
      return;
    }

    if (isSignUp) {
      if (!data.session) {
        setMessage(
          'Account created. If email confirmation is enabled in Supabase, disable it for this username flow.'
        );
      } else {
        setMessage('Account created. You can sign in now.');
      }
      setIsSignUp(false);
      setPassword('');
    } else {
      setMessage('Signed in.');
    }
  }

  return (
    <div className="card auth-card">
      <h1>Accountbook</h1>
      <p className="muted">Track who you gave and who you got from.</p>
      <p className="muted">{isSignUp ? 'Create account' : 'Sign in'}</p>
      <form onSubmit={handleSubmit} className="stack">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          type="text"
          placeholder="Username (e.g. krish_01)"
          autoCapitalize="off"
          autoCorrect="off"
          required
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password (min 6 chars)"
          minLength={6}
          required
        />
        <button type="submit">{isSignUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="link" onClick={() => setIsSignUp((s) => !s)}>
        {isSignUp ? 'Already have an account? Sign in' : 'New user? Create account'}
      </button>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
