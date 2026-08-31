'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CRM_CHANNELS, CRM_PRIORITIES, CRM_STATUSES, whatsappUrl, type CrmLead, type CrmLeadEvent } from '../../../lib/crm';
import type { CrmContactExtraction } from '../../../lib/crm-contact-extraction';
import type { Customer } from '../../../lib/types';
import { CrmLeadCapture } from './crm-lead-capture';

type LeadResponse = { lead?: CrmLead; events?: CrmLeadEvent[]; error?: string };
type GoogleSyncState = {
  last_succeeded_at: string | null;
  last_error: string;
  received: number;
  created: number;
  merged: number;
  initialized: number;
  skipped: number;
};
type NewLead = Record<'source' | 'first_name' | 'last_name' | 'company' | 'phone' | 'email' | 'street' | 'house_number' | 'zip' | 'city' | 'interest' | 'manufacturer' | 'rooms' | 'area' | 'summary', string>;

const emptyLead: NewLead = { source: 'Manuell', first_name: '', last_name: '', company: '', phone: '', email: '', street: '', house_number: '', zip: '', city: '', interest: '', manufacturer: '', rooms: '', area: '', summary: '' };
const visibleStatuses = CRM_STATUSES.filter((item) => item !== 'Gelöscht');

function displayName(lead: CrmLead) {
  return lead.company || `${lead.first_name} ${lead.last_name}`.trim() || 'Unbenannter Kontakt';
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
}

function dateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CrmPanel({ adminName }: { adminName: string }) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [existingCustomerCount, setExistingCustomerCount] = useState(0);
  const [googleSync, setGoogleSync] = useState<GoogleSyncState | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [onlyExistingCustomers, setOnlyExistingCustomers] = useState(false);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [events, setEvents] = useState<CrmLeadEvent[]>([]);
  const [newLead, setNewLead] = useState<NewLead>(emptyLead);
  const [showNew, setShowNew] = useState(false);
  const [eventNote, setEventNote] = useState('');
  const [eventChannel, setEventChannel] = useState('Telefon');
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const leadListRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const loadLeads = useCallback(async () => {
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set('q', query.trim());
    if (status) parameters.set('status', status);
    if (onlyExistingCustomers) parameters.set('linked', '1');
    const response = await fetch(`/api/admin/crm/leads?${parameters}`, { cache: 'no-store' });
    const payload = await response.json() as { leads?: CrmLead[]; counts?: Record<string, number>; existingCustomerCount?: number; googleSync?: GoogleSyncState | null; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Leads konnten nicht geladen werden.');
    setLeads(payload.leads ?? []);
    setCounts(payload.counts ?? {});
    setExistingCustomerCount(payload.existingCustomerCount ?? 0);
    setGoogleSync(payload.googleSync ?? null);
  }, [onlyExistingCustomers, query, status]);

  const openLead = useCallback(async (id: string) => {
    setBusy('detail'); setError(''); setDuplicates([]);
    try {
      const response = await fetch(`/api/admin/crm/leads/${id}`, { cache: 'no-store' });
      const payload = await response.json() as LeadResponse;
      if (!response.ok || !payload.lead) throw new Error(payload.error || 'Lead konnte nicht geladen werden.');
      setSelected(payload.lead); setEvents(payload.events ?? []);
      if (window.matchMedia('(max-width: 980px)').matches) {
        window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Lead konnte nicht geladen werden.'); }
    finally { setBusy(''); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLeads().catch((caught) => setError(caught instanceof Error ? caught.message : 'Leads konnten nicht geladen werden.')); }, 180);
    return () => window.clearTimeout(timer);
  }, [loadLeads]);

  function edit<K extends keyof CrmLead>(key: K, value: CrmLead[K]) {
    setSelected((current) => current ? { ...current, [key]: value } : current);
  }

  function applyExtraction(result: CrmContactExtraction) {
    setNewLead((current) => ({
      ...current,
      source: result.source || current.source,
      company: result.company || current.company,
      first_name: result.first_name || current.first_name,
      last_name: result.last_name || current.last_name,
      phone: result.phone || current.phone,
      email: result.email || current.email,
      street: result.street || current.street,
      house_number: result.house_number || current.house_number,
      zip: result.zip || current.zip,
      city: result.city || current.city,
      interest: result.interest || current.interest,
      manufacturer: result.manufacturer || current.manufacturer,
      rooms: result.rooms || current.rooms,
      area: result.area || current.area,
      summary: result.summary || current.summary,
    }));
    setError('');
    setNotice(result.review_notes.length
      ? `Angaben wurden übernommen. Bitte prüfen: ${result.review_notes.join(' · ')}`
      : 'Angaben wurden übernommen. Bitte vor dem Speichern kurz prüfen.');
  }

  async function createLead(event: React.FormEvent) {
    event.preventDefault(); setBusy('create'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/crm/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(newLead) });
      const payload = await response.json() as { lead?: CrmLead; merged?: boolean; error?: string };
      if (!response.ok || !payload.lead) throw new Error(payload.error || 'Lead konnte nicht angelegt werden.');
      setNewLead(emptyLead); setShowNew(false); setNotice(payload.merged ? 'Der Kontakt war bereits vorhanden. Die neue Anfrage wurde ergänzt.' : 'Neuer Lead wurde angelegt.');
      await loadLeads(); await openLead(payload.lead.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Lead konnte nicht angelegt werden.'); }
    finally { setBusy(''); }
  }

  async function saveLead() {
    if (!selected) return;
    setBusy('save'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/crm/leads/${selected.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(selected) });
      const payload = await response.json() as LeadResponse;
      if (!response.ok || !payload.lead) throw new Error(payload.error || 'Änderungen konnten nicht gespeichert werden.');
      setSelected(payload.lead); setNotice('Änderungen gespeichert.'); await loadLeads();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Änderungen konnten nicht gespeichert werden.'); }
    finally { setBusy(''); }
  }

  async function addEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy('event'); setError('');
    try {
      const response = await fetch(`/api/admin/crm/leads/${selected.id}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: eventChannel, note: eventNote }) });
      const payload = await response.json() as { event?: CrmLeadEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error || 'Kontakt konnte nicht gespeichert werden.');
      setEventNote(''); await openLead(selected.id); await loadLeads(); setNotice('Kontakt wurde im Verlauf gespeichert.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Kontakt konnte nicht gespeichert werden.'); }
    finally { setBusy(''); }
  }

  async function exportToPlenty(existingCustomer?: Customer, force = false) {
    if (!selected) return;
    setBusy('plenty'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/crm/leads/${selected.id}/plenty`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ existingCustomer, force }) });
      const payload = await response.json() as { customer?: Customer; duplicates?: Customer[]; error?: string };
      if (response.status === 409 && payload.duplicates) { setDuplicates(payload.duplicates); return; }
      if (!response.ok || !payload.customer) throw new Error(payload.error || 'Übergabe an Plenty fehlgeschlagen.');
      setDuplicates([]); setNotice(`Mit Plenty-Kontakt ${payload.customer.id} verbunden.`); await openLead(selected.id); await loadLeads();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Übergabe an Plenty fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  async function removeLead() {
    if (!selected || !window.confirm(`${displayName(selected)} wirklich aus der aktiven CRM-Liste entfernen? Der Datensatz bleibt archiviert.`)) return;
    setBusy('delete'); setError('');
    const response = await fetch(`/api/admin/crm/leads/${selected.id}`, { method: 'DELETE' });
    if (!response.ok) setError('Der Lead konnte nicht entfernt werden.');
    else { setSelected(null); setEvents([]); setNotice('Lead wurde archiviert.'); await loadLeads(); }
    setBusy('');
  }

  async function reconcileUnknownLeads() {
    if (!window.confirm('Unbenannte Kontakte jetzt mit Plenty abgleichen? Ohne eindeutigen Treffer werden sie aus der aktiven Liste ausgeblendet.')) return;
    setBusy('reconcile'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/crm/reconcile-plenty', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      });
      const payload = await response.json() as { candidates?: number; matched?: number; hidden?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Plenty-Abgleich fehlgeschlagen.');
      setSelected(null); setEvents([]);
      setNotice(`${payload.candidates ?? 0} unbenannte Kontakte geprüft: ${payload.matched ?? 0} ergänzt, ${payload.hidden ?? 0} ausgeblendet${payload.failed ? `, ${payload.failed} nicht geprüft` : ''}.`);
      await loadLeads();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Plenty-Abgleich fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  return <main className="admin-shell crm-shell">
    <header className="admin-topbar"><a aria-label="Zur Startseite" className="brand-lockup brand-home-link" href="/"><span className="brand-mark">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">CRM & Leads</p></div></a><div className="admin-nav"><a href="/admin">← Verwaltung</a><a href="/arbeitsnachweis">Arbeitsnachweis</a></div></header>
    <section className="crm-content">
      <div className="crm-heading"><div><span className="eyebrow">Angemeldet als {adminName}</span><h1>CRM & Leads</h1><p>Anfragen, Kontakte und die Übergabe an Plenty zentral verwalten.</p></div><div className="crm-heading-actions"><button className="secondary-button" disabled={busy === 'reconcile'} onClick={() => void reconcileUnknownLeads()} type="button">{busy === 'reconcile' ? 'Prüfe Plenty …' : 'Unbenannte abgleichen'}</button><button className="primary-button" onClick={() => setShowNew((value) => !value)} type="button">{showNew ? 'Schließen' : '+ Neuer Lead'}</button></div></div>
      <div className={`crm-sync-banner ${googleSync?.last_error ? 'sync-error' : ''}`}>
        <span aria-hidden="true" />
        <div><strong>Google-Eingang</strong><small>{googleSync?.last_succeeded_at ? `Automatisch abgeglichen · zuletzt ${dateTime(googleSync.last_succeeded_at)}` : 'Automatische Verbindung wird eingerichtet'}</small></div>
        {googleSync?.last_error ? <b>Letzter Fehler</b> : <b>{googleSync?.created ? `${googleSync.created} neu` : 'Aktuell'}</b>}
      </div>
      {notice ? <div className="alert success-alert">{notice}</div> : null}
      {error ? <div className="alert error-alert">{error}</div> : null}
      {showNew ? <form className="crm-new-card" onSubmit={createLead}>
        <div className="form-card-head"><div><span className="card-kicker">Neue Anfrage</span><h2>Lead erfassen</h2></div></div>
        <CrmLeadCapture onExtract={applyExtraction} />
        <div className="crm-review-heading"><span className="card-kicker">Prüfen und ergänzen</span><h3>Erkannte Kundendaten</h3><p>Leere oder falsch erkannte Angaben kannst du hier korrigieren.</p></div>
        <div className="crm-form-grid">
          <label><span>Quelle</span><select value={newLead.source} onChange={(event) => setNewLead({ ...newLead, source: event.target.value })}><option>Manuell</option><option>Diktat</option><option>Text</option><option>Foto</option><option>Telefon</option><option>E-Mail</option><option>Website</option><option>Fonio</option><option>Drive-PDF</option></select></label>
          <label><span>Firma</span><input value={newLead.company} onChange={(event) => setNewLead({ ...newLead, company: event.target.value })} /></label>
          <label><span>Vorname</span><input value={newLead.first_name} onChange={(event) => setNewLead({ ...newLead, first_name: event.target.value })} /></label>
          <label><span>Nachname</span><input value={newLead.last_name} onChange={(event) => setNewLead({ ...newLead, last_name: event.target.value })} /></label>
          <label><span>Telefon</span><input type="tel" value={newLead.phone} onChange={(event) => setNewLead({ ...newLead, phone: event.target.value })} /></label>
          <label><span>E-Mail</span><input type="email" value={newLead.email} onChange={(event) => setNewLead({ ...newLead, email: event.target.value })} /></label>
          <label><span>Straße</span><input value={newLead.street} onChange={(event) => setNewLead({ ...newLead, street: event.target.value })} /></label>
          <label><span>Hausnummer</span><input value={newLead.house_number} onChange={(event) => setNewLead({ ...newLead, house_number: event.target.value })} /></label>
          <label><span>PLZ</span><input value={newLead.zip} onChange={(event) => setNewLead({ ...newLead, zip: event.target.value })} /></label>
          <label><span>Ort</span><input value={newLead.city} onChange={(event) => setNewLead({ ...newLead, city: event.target.value })} /></label>
          <label className="wide"><span>Interesse / Anliegen</span><input value={newLead.interest} onChange={(event) => setNewLead({ ...newLead, interest: event.target.value })} /></label>
          <label><span>Hersteller</span><input value={newLead.manufacturer} onChange={(event) => setNewLead({ ...newLead, manufacturer: event.target.value })} /></label>
          <label><span>Räume</span><input value={newLead.rooms} onChange={(event) => setNewLead({ ...newLead, rooms: event.target.value })} /></label>
          <label><span>Fläche</span><input value={newLead.area} onChange={(event) => setNewLead({ ...newLead, area: event.target.value })} /></label>
          <label className="wide"><span>Zusammenfassung</span><textarea value={newLead.summary} onChange={(event) => setNewLead({ ...newLead, summary: event.target.value })} /></label>
        </div>
        <button className="primary-button" disabled={busy === 'create'} type="submit">{busy === 'create' ? 'Speichere …' : 'Geprüften Lead anlegen'}</button>
      </form> : null}
      <div className="crm-filters"><input aria-label="Leads durchsuchen" placeholder="Name, Firma, Telefon, E-Mail, Ort oder Anliegen suchen …" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="crm-statuses"><button className={!status && !onlyExistingCustomers ? 'active' : ''} onClick={() => { setStatus(''); setOnlyExistingCustomers(false); }} type="button">Alle <b>{Object.entries(counts).filter(([name]) => name !== 'Gelöscht').reduce((sum, [, count]) => sum + count, 0)}</b></button><button className={onlyExistingCustomers ? 'active' : ''} onClick={() => { setStatus(''); setOnlyExistingCustomers(true); }} type="button">Bestandskunden <b>{existingCustomerCount}</b></button>{visibleStatuses.map((item) => <button className={status === item && !onlyExistingCustomers ? 'active' : ''} key={item} onClick={() => { setStatus(item); setOnlyExistingCustomers(false); }} type="button">{item} <b>{counts[item] ?? 0}</b></button>)}</div></div>
      <div className="crm-workspace">
        <aside className="crm-lead-list" ref={leadListRef}>{leads.length ? leads.map((lead) => <button className={selected?.id === lead.id ? 'selected' : ''} key={lead.id} onClick={() => void openLead(lead.id)} type="button"><div><span className={`crm-priority priority-${lead.priority.toLowerCase()}`}>{lead.priority}</span>{lead.plenty_contact_id ? <span className="crm-existing-customer">Bestandskunde{lead.plenty_customer_number ? ` · Nr. ${lead.plenty_customer_number}` : ''}</span> : null}<strong>{displayName(lead)}</strong><small>{[lead.first_name, lead.last_name].filter(Boolean).join(' ')}{lead.city ? ` · ${lead.city}` : ''}</small></div><div><span>{lead.status}</span><small>{dateTime(lead.last_contact_at)}</small></div></button>) : <div className="empty-state"><strong>Keine Leads gefunden</strong><p>Lege einen neuen Lead an oder ändere den Filter.</p></div>}</aside>
        <section className="crm-detail" ref={detailRef}>{selected ? <><button className="crm-list-back" onClick={() => leadListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} type="button">← Andere Leads</button><div className="crm-detail-head"><div><span className="card-kicker">Kontaktakte</span>{selected.plenty_contact_id ? <div className="crm-customer-number"><span>Bestandskunde</span><strong>{selected.plenty_customer_number ? `Kundennummer ${selected.plenty_customer_number}` : `Plenty-Kontakt ${selected.plenty_contact_id}`}</strong></div> : null}<h2>{displayName(selected)}</h2><p>{selected.contact_count} Kontakt{selected.contact_count === 1 ? '' : 'e'} · zuletzt {dateTime(selected.last_contact_at)}</p></div><div className="crm-quick-actions">{selected.phone ? <a href={`tel:${selected.phone}`}>Anrufen</a> : null}{selected.phone ? <a href={whatsappUrl(selected.phone)} rel="noreferrer" target="_blank">WhatsApp</a> : null}{selected.email ? <a href={`mailto:${selected.email}`}>E-Mail</a> : null}</div></div>
          <div className="crm-form-grid"><label><span>Status</span><select value={selected.status} onChange={(event) => edit('status', event.target.value)}>{CRM_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Priorität</span><select value={selected.priority} onChange={(event) => edit('priority', event.target.value)}>{CRM_PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Firma</span><input value={selected.company} onChange={(event) => edit('company', event.target.value)} /></label><label><span>Ansprechpartner</span><input value={`${selected.first_name} ${selected.last_name}`.trim()} onChange={(event) => { const parts = event.target.value.trim().split(/\s+/); edit('first_name', parts.shift() ?? ''); edit('last_name', parts.join(' ')); }} /></label><label><span>Telefon</span><input type="tel" value={selected.phone} onChange={(event) => edit('phone', event.target.value)} /></label><label><span>E-Mail</span><input type="email" value={selected.email} onChange={(event) => edit('email', event.target.value)} /></label><label><span>Straße</span><input value={selected.street} onChange={(event) => edit('street', event.target.value)} /></label><label><span>Hausnummer</span><input value={selected.house_number} onChange={(event) => edit('house_number', event.target.value)} /></label><label><span>PLZ</span><input value={selected.zip} onChange={(event) => edit('zip', event.target.value)} /></label><label><span>Ort</span><input value={selected.city} onChange={(event) => edit('city', event.target.value)} /></label><label><span>Zuständig</span><input value={selected.assignee} onChange={(event) => edit('assignee', event.target.value)} /></label><label><span>Termin</span><input type="datetime-local" value={dateTimeInput(selected.appointment_at)} onChange={(event) => edit('appointment_at', event.target.value || null)} /></label><label className="wide"><span>Tags (mit Komma trennen)</span><input value={selected.tags.join(', ')} onChange={(event) => edit('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></label><label className="wide"><span>Interesse / Anliegen</span><input value={selected.interest} onChange={(event) => edit('interest', event.target.value)} /></label><label><span>Hersteller</span><input value={selected.manufacturer} onChange={(event) => edit('manufacturer', event.target.value)} /></label><label><span>Räume</span><input value={selected.rooms} onChange={(event) => edit('rooms', event.target.value)} /></label><label><span>Fläche</span><input value={selected.area} onChange={(event) => edit('area', event.target.value)} /></label><label className="wide"><span>Zusammenfassung</span><textarea value={selected.summary} onChange={(event) => edit('summary', event.target.value)} /></label><label className="wide"><span>Interne Notizen</span><textarea value={selected.internal_notes} onChange={(event) => edit('internal_notes', event.target.value)} /></label></div>
          <div className="crm-save-row"><button className="primary-button" disabled={busy === 'save'} onClick={() => void saveLead()} type="button">{busy === 'save' ? 'Speichere …' : 'Änderungen speichern'}</button><button className="danger-link" disabled={busy === 'delete'} onClick={() => void removeLead()} type="button">Archivieren</button></div>
          <section className="crm-plenty-card"><div><span className="card-kicker">PlentyMarkets</span><h3>{selected.plenty_contact_id ? `Bestandskunde${selected.plenty_customer_number ? ` · Kundennummer ${selected.plenty_customer_number}` : ''}` : 'Als Kunden übergeben'}</h3><p>{selected.plenty_contact_id ? `Verbunden mit Plenty-Kontakt ${selected.plenty_contact_id}.` : 'Rechnungs- und Lieferadresse werden als primäre Plenty-Adressen angelegt.'}</p></div><button className="secondary-button" disabled={busy === 'plenty' || Boolean(selected.plenty_contact_id)} onClick={() => void exportToPlenty()} type="button">{busy === 'plenty' ? 'Prüfe …' : selected.plenty_contact_id ? 'Bereits verbunden' : 'An Plenty übergeben'}</button></section>
          {duplicates.length ? <div className="duplicate-box"><strong>Mögliche bestehende Plenty-Kunden gefunden</strong>{duplicates.map((customer) => <button key={customer.id} onClick={() => void exportToPlenty(customer)} type="button"><b>{customer.company || customer.fullName}</b><br />{customer.email} · {customer.street} {customer.houseNumber}, {customer.zip} {customer.city}</button>)}<button className="danger-button" onClick={() => void exportToPlenty(undefined, true)} type="button">Trotzdem neuen Kunden anlegen</button></div> : null}
          <section className="crm-history"><div className="crm-history-head"><div><span className="card-kicker">Verlauf</span><h3>Kontakte und Notizen</h3></div></div><form className="crm-event-form" onSubmit={addEvent}><select value={eventChannel} onChange={(event) => setEventChannel(event.target.value)}>{CRM_CHANNELS.map((item) => <option key={item}>{item}</option>)}</select><input placeholder="Was wurde besprochen oder erledigt?" required value={eventNote} onChange={(event) => setEventNote(event.target.value)} /><button className="secondary-button" disabled={busy === 'event'} type="submit">Eintragen</button></form><div className="crm-events">{events.map((entry) => <article key={entry.id}><span>{entry.channel}</span><div><strong>{entry.note}</strong><small>{dateTime(entry.occurred_at)} · {entry.created_by}</small></div></article>)}</div></section>
        </> : <div className="crm-placeholder"><span>CRM</span><h2>Kontakt auswählen</h2><p>Links einen Lead öffnen oder oben einen neuen Kontakt erfassen.</p></div>}</section>
      </div>
    </section>
  </main>;
}
