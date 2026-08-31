'use client';

import Link from 'next/link';

export function HomePortal({ isAdmin, userInitials, userName }: { isAdmin: boolean; userInitials: string; userName: string }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return <main className="portal-shell">
    <header className="topbar">
      <Link aria-label="Zur Startseite" className="brand-lockup brand-home-link" href="/"><span className="brand-mark" aria-hidden="true">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">Serviceportal</p></div></Link>
      <div className="topbar-actions"><span className="portal-user">Angemeldet als {userName}</span><button className="user-button" onClick={() => void logout()} title={`${userName} – abmelden`} type="button" aria-label={`${userName} abmelden`}>{userInitials}</button></div>
    </header>
    <section className="portal-content">
      <div className="portal-heading"><span className="eyebrow">Mifrro Serviceportal</span><h1>Was möchtest du erledigen?</h1><p>Arbeitsnachweise erfassen oder Kunden und Anfragen im CRM bearbeiten.</p></div>
      <div className="portal-grid">
        <Link className="portal-card work-report-card" href="/arbeitsnachweis"><span className="portal-icon">AN</span><div><span className="card-kicker">Außendienst</span><h2>Arbeitsnachweise</h2><p>Kunden suchen, Einsatz dokumentieren, unterschreiben und als PDF einreichen.</p></div><b>Arbeitsnachweis öffnen →</b></Link>
        {isAdmin ? <Link className="portal-card crm-portal-card" href="/admin/crm"><span className="portal-icon">CRM</span><div><span className="card-kicker">Kunden & Anfragen</span><h2>CRM-Daten</h2><p>Leads anlegen, Kontaktdaten prüfen, den Verlauf pflegen und an Plenty übergeben.</p></div><b>CRM öffnen →</b></Link> : null}
        {isAdmin ? <Link className="portal-card admin-portal-card" href="/admin"><span className="portal-icon">V</span><div><span className="card-kicker">Büro</span><h2>Verwaltung</h2><p>Arbeitsnachweise prüfen, Plenty-Aufträge vorbereiten und Mitarbeiter verwalten.</p></div><b>Verwaltung öffnen →</b></Link> : null}
      </div>
    </section>
  </main>;
}
