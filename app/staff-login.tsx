'use client';

import { useState } from 'react';

export function StaffLogin({
  initialMode = 'employee',
  initialName = '',
}: {
  initialMode?: 'employee' | 'admin';
  initialName?: string;
}) {
  const [mode, setMode] = useState<'employee' | 'admin'>(initialMode);
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, name, pin }),
      });
      const payload = await response.json() as { authenticated?: boolean; error?: string };
      if (!response.ok || !payload.authenticated) throw new Error(payload.error || 'Anmeldung fehlgeschlagen.');
      const requestedPage = new URLSearchParams(window.location.search).get('next');
      const safeRequestedPage = requestedPage?.startsWith('/') && !requestedPage.startsWith('//') ? requestedPage : '';
      window.location.href = safeRequestedPage || '/';
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Anmeldung fehlgeschlagen.');
    } finally { setBusy(false); }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark" aria-hidden="true">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">Arbeitsnachweis</p></div></div>
        <div className="login-heading"><span className="eyebrow">Geschützter Zugang</span><h1>{mode === 'admin' ? 'Administration' : 'Mitarbeiter-Anmeldung'}</h1><p>{mode === 'admin' ? 'Mitarbeiter anlegen, PINs zurücksetzen und Zugänge entfernen.' : 'Bitte mit Vor- und Nachname sowie der persönlichen PIN anmelden.'}</p></div>
        <div className="login-tabs" role="tablist"><button className={mode === 'employee' ? 'active' : ''} onClick={() => { setMode('employee'); setError(''); }} type="button">Mitarbeiter</button><button className={mode === 'admin' ? 'active' : ''} onClick={() => { setMode('admin'); setError(''); }} type="button">Admin</button></div>
        <form className="login-form" onSubmit={login}>
          {mode === 'employee' ? <label><span>Vor- und Nachname</span><input autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} placeholder="z. B. Daniel Seibold" required/></label> : null}
          <label><span>{mode === 'admin' ? 'Admin-PIN' : 'Persönliche PIN'}</span><input autoComplete="current-password" inputMode="numeric" maxLength={6} minLength={6} pattern="[0-9]{6}" type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-stellige PIN" required/></label>
          {error ? <div className="alert error-alert">{error}</div> : null}
          <button className="primary-button full-button" disabled={busy || pin.length !== 6 || (mode === 'employee' && !name.trim())} type="submit">{busy ? 'Anmeldung läuft …' : 'Sicher anmelden'}</button>
        </form>
        <p className="login-security">Die Anmeldung bleibt auf diesem Gerät 30 Tage aktiv. PINs werden nicht lesbar gespeichert.</p>
      </section>
    </main>
  );
}
