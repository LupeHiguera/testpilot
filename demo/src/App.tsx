import { FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Variant = 'normal' | 'copy-change' | 'regression';

function getVariant(): Variant {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('variant');
  if (variant === 'copy-change' || variant === 'regression') {
    return variant;
  }
  return 'normal';
}

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const variant = useMemo(getVariant, []);
  const buttonText = variant === 'copy-change' ? 'Log in' : 'Sign in';

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', `${nextPath}${window.location.search}`);
    setPath(nextPath);
  };

  window.onpopstate = () => setPath(window.location.pathname);

  const submitLogin = (event: FormEvent) => {
    event.preventDefault();
    if (email === 'demo@example.com' && password === 'password123') {
      navigate(variant === 'regression' ? '/login' : '/dashboard');
    }
  };

  if (path === '/dashboard') {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Dashboard</p>
          <h1>Welcome, Demo User</h1>
          <p>Your account is ready for QA automation.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <form className="panel" onSubmit={submitLogin}>
        <p className="eyebrow">testpilot demo</p>
        <h1>Sign in</h1>
        <label>
          Email
          <input
            name="email"
            type="email"
            value={email}
            autoComplete="email"
            placeholder="demo@example.com"
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder="password123"
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <button type="submit">{buttonText}</button>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
