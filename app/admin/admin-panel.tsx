'use client';

import { useCallback, useEffect, useState } from 'react';
import { PERSONNEL_ROLES } from '../../lib/personnel';

type Employee = { id: string; name: string; job_role: string; created_at: string };
type Report = { id: string; report_number: string; status: string; customer_company: string; customer_name: string; customer_email: string; work_date: string; employee_name: string; addition_count: number; order_status?: 'draft' | 'created' | null; plenty_order_id?: string | null };
type AccessCard = { name: string; pin: string };

function statusLabel(status: string) {
  if (status === 'pending_review') return 'Zu prüfen';
  if (status === 'sent') return 'Versendet';
  return 'Geprüft';
}

function reportActionLabel(status: string) {
  if (status === 'pending_review') return 'Prüfen →';
  return 'Auftrag ansehen →';
}

export function AdminPanel({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<'reports' | 'employees'>('reports');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [name, setName] = useState('');
  const [jobRole, setJobRole] = useState('Kältemechatroniker');
  const [access, setAccess] = useState<AccessCard | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [reportsLoadedAt, setReportsLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [usersResponse, reportsResponse] = await Promise.all([
        fetch('/api/admin/users', { cache: 'no-store' }),
        fetch('/api/admin/reports', { cache: 'no-store' }),
      ]);
      if (!reportsResponse.ok) throw new Error('Die Arbeitsnachweise konnten nicht geladen werden.');
      setReports(((await reportsResponse.json()) as { reports: Report[] }).reports);
      setReportsLoadedAt(new Date());
      setLoadError('');
      if (usersResponse.ok) setEmployees(((await usersResponse.json()) as { users: Employee[] }).users);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Die Verwaltung konnte nicht aktualisiert werden.');
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const refreshWhenFocused = () => void load();
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('mifrro-reports');
    if (channel) channel.onmessage = (event) => { if (event.data === 'report-created') void load(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenFocused);
    return () => {
      channel?.close();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenFocused);
    };
  }, [load]);

  async function refreshReports() {
    setBusy('refresh');
    setLoadError('');
    await load();
    setBusy('');
  }

  async function addEmployee(event: React.FormEvent) {
    event.preventDefault(); setBusy('add'); setError(''); setAccess(null);
    try {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, jobRole }) });
      const payload = await response.json() as { user?: Employee; pin?: string; error?: string };
      if (!response.ok || !payload.user || !payload.pin) throw new Error(payload.error || 'Mitarbeiter konnte nicht angelegt werden.');
      setAccess({ name: payload.user.name, pin: payload.pin }); setName(''); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Mitarbeiter konnte nicht angelegt werden.'); }
    finally { setBusy(''); }
  }

  async function resetPin(employee: Employee) {
    setBusy(employee.id); setError('');
    try {
      const response = await fetch(`/api/admin/users/${employee.id}`, { method: 'PATCH' });
      const payload = await response.json() as { pin?: string; error?: string };
      if (!response.ok || !payload.pin) throw new Error(payload.error || 'PIN konnte nicht erneuert werden.');
      setAccess({ name: employee.name, pin: payload.pin });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'PIN konnte nicht erneuert werden.'); }
    finally { setBusy(''); }
  }

  async function removeEmployee(employee: Employee) {
    if (!window.confirm(`${employee.name} wirklich den Zugang entziehen? Die vorhandenen Arbeitsnachweise bleiben erhalten.`)) return;
    setBusy(employee.id); setError('');
    const response = await fetch(`/api/admin/users/${employee.id}`, { method: 'DELETE' });
    if (!response.ok) setError('Der Zugang konnte nicht entfernt werden.');
    else { if (access?.name === employee.name) setAccess(null); await load(); }
    setBusy('');
  }

  function inviteUrl(employeeName: string) {
    return `${window.location.origin}/?employee=${encodeURIComponent(employeeName)}`;
  }

  async function shareAccess(card: AccessCard) {
    const text = `Hallo ${card.name},\n\nhier ist deine MIFRRO-Arbeitsnachweis-App:\n${inviteUrl(card.name)}\n\nDeine persönliche PIN: ${card.pin}\n\nAuf dem iPhone: Link in Safari öffnen, Teilen antippen und „Zum Home-Bildschirm“ wählen.`;
    if (navigator.share) await navigator.share({ title: 'MIFRRO Arbeitsnachweis', text });
    else { await navigator.clipboard.writeText(text); window.alert('Einladung wurde kopiert.'); }
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/'; }

  const pendingCount = reports.filter((report) => report.status === 'pending_review').length;
  return <main className="admin-shell">
    <header className="admin-topbar"><div className="brand-lockup"><span className="brand-mark">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">Administration</p></div></div><div className="admin-nav"><a href="/">← Zur Startseite</a><button onClick={logout} type="button">Abmelden</button></div></header>
    <section className="admin-content"><div className="admin-heading"><div><span className="eyebrow">Angemeldet als {adminName}</span><h1>Verwaltung</h1><p>Mitarbeiterzugänge und eingereichte Arbeitsnachweise zentral verwalten.</p>{reportsLoadedAt ? <small>Zuletzt aktualisiert: {reportsLoadedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small> : null}</div><div className="admin-heading-actions"><a className="secondary-button" href="/">← Zur Startseite</a><button className="secondary-button" disabled={busy === 'refresh'} onClick={() => void refreshReports()} type="button">{busy === 'refresh' ? 'Aktualisiere …' : 'Arbeitsnachweise aktualisieren'}</button></div></div>
      <div className="admin-tabs"><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')} type="button">Arbeitsnachweise {pendingCount ? <b>{pendingCount}</b> : null}</button><button className={tab === 'employees' ? 'active' : ''} onClick={() => setTab('employees')} type="button">Mitarbeiter</button></div>
      {loadError ? <div className="alert error-alert">{loadError}</div> : null}
      {error ? <div className="alert error-alert">{error}</div> : null}
      {tab === 'reports' ? <div className="admin-list">{reports.length ? reports.map((report) => <a className={`admin-row report-row status-${report.status}`} href={`/admin/reports/${report.id}`} key={report.id}><div><span className="status-pill">{statusLabel(report.status)}</span><strong>{report.report_number}</strong><small>{report.customer_company || report.customer_name}</small></div><div><span>Erstellt von</span><strong>{report.employee_name}</strong><small>{new Date(`${report.work_date}T12:00:00`).toLocaleDateString('de-DE')}</small></div><div><span>{report.order_status === 'created' ? 'Plenty-Auftrag' : report.order_status === 'draft' ? 'Auftragsentwurf' : 'Nachträge'}</span><strong>{report.order_status === 'created' ? report.plenty_order_id || 'Angelegt' : report.order_status === 'draft' ? 'In Arbeit' : report.addition_count || '–'}</strong><small>{report.customer_email}</small></div><b>{reportActionLabel(report.status)}</b></a>) : <div className="empty-state"><strong>Noch keine Arbeitsnachweise</strong><p>Eingereichte Nachweise erscheinen automatisch hier.</p></div>}</div> : <div className="admin-grid"><form className="admin-card" onSubmit={addEmployee}><span className="card-kicker">Neuer Zugang</span><h2>Mitarbeiter hinzufügen</h2><label><span>Vor- und Nachname</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label><span>Rolle</span><select value={jobRole} onChange={(event) => setJobRole(event.target.value)}>{PERSONNEL_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label><button className="primary-button full-button" disabled={busy === 'add'} type="submit">{busy === 'add' ? 'Wird angelegt …' : 'Mitarbeiter anlegen'}</button></form>
        <section className="admin-card"><span className="card-kicker">Aktive Zugänge</span><h2>{employees.length} Mitarbeiter</h2><div className="employee-list">{employees.map((employee) => <div className="employee-row" key={employee.id}><div><strong>{employee.name}</strong><small>{employee.job_role}</small></div><button onClick={() => void resetPin(employee)} disabled={busy === employee.id} type="button">Neue PIN</button><button className="danger-link" onClick={() => void removeEmployee(employee)} disabled={busy === employee.id} type="button">Entfernen</button></div>)}</div></section>
      </div>}
      {access ? <div className="access-card"><div><span>Nur jetzt vollständig sichtbar</span><strong>{access.name}</strong><b>{access.pin}</b></div><button onClick={() => void shareAccess(access)} type="button">Einladung teilen</button><button onClick={() => void navigator.clipboard.writeText(access.pin)} type="button">PIN kopieren</button></div> : null}
    </section>
  </main>;
}
