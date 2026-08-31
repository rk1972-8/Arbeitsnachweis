'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult, Customer, NewCustomerInput, PersonnelRow, PositionRow, WorkReportDraft } from '../lib/types';
import { ROUTE_ARTICLES, withAutomaticPositions } from '../lib/automatic-positions';
import { DEFAULT_PERSONNEL_ROLE, PERSONNEL_ROLES } from '../lib/personnel';
import { MIFRRO_ORIGIN_ADDRESS } from '../lib/routing';
import { buildWorkReportEmailBody, reportSenderName } from '../lib/email';
import type { CrmContactExtraction } from '../lib/crm-contact-extraction';
import { ArticleSearch } from './article-search';
import { ContactCapture } from './contact-capture';
import { SignaturePad } from './signature-pad';

const demoCustomers: Customer[] = [
  { id: 'K-10482', number: '10482', company: 'Köhler Haustechnik GmbH', firstName: 'Michael', lastName: 'Köhler', fullName: 'Michael Köhler', email: 'm.koehler@beispiel.de', phone: '', street: 'Industriestraße', houseNumber: '18', zip: '77656', city: 'Offenburg' },
  { id: 'K-09714', number: '09714', company: 'Hotel am Stadtgarten', firstName: 'Sarah', lastName: 'Winter', fullName: 'Sarah Winter', email: 'technik@stadtgarten.example', phone: '', street: 'Hauptstraße', houseNumber: '42', zip: '77933', city: 'Lahr' },
  { id: 'K-08126', number: '08126', company: 'Bäckerei Faller', firstName: 'Thomas', lastName: 'Faller', fullName: 'Thomas Faller', email: 'info@faller.example', phone: '', street: 'Marktplatz', houseNumber: '7', zip: '77723', city: 'Gengenbach' },
];

const steps = [
  { title: 'Kunde', subtitle: 'Kunde auswählen' },
  { title: 'Einsatz', subtitle: 'Daten und Diktat' },
  { title: 'Leistungen', subtitle: 'Prüfen und ergänzen' },
  { title: 'Freigabe', subtitle: 'Signatur und Versand' },
];

const blankCustomer: Customer = { id: '', number: '', company: '', firstName: '', lastName: '', fullName: '', email: '', phone: '', street: '', houseNumber: '', zip: '', city: '' };
const blankNewCustomer: NewCustomerInput = { company: '', firstName: '', lastName: '', email: '', phone: '', street: '', houseNumber: '', zip: '', city: '' };
type CustomerSearchFilters = Record<'number' | 'company' | 'contact' | 'email' | 'phone' | 'zip' | 'city', string>;
const blankCustomerSearch: CustomerSearchFilters = { number: '', company: '', contact: '', email: '', phone: '', zip: '', city: '' };

function customerAddress(customer: Customer) {
  return `${customer.street} ${customer.houseNumber}, ${customer.zip} ${customer.city}`.replace(/\s+,/g, ',').trim();
}

function initialDraft(userName: string, userRole: string): WorkReportDraft {
  return {
    customer: blankCustomer,
    workDate: new Date().toISOString().slice(0, 10),
    workAddress: '',
    workEmail: '',
    dictation: '',
    workMinutes: 0,
    driveMinutes: 0,
    distanceKm: 0,
    personnel: [{ id: crypto.randomUUID(), name: userName, role: userRole || DEFAULT_PERSONNEL_ROLE, hours: 0 }],
    positions: [],
    workDescription: '',
    findings: '',
    complaints: '',
    recommendations: '',
    internalNotes: '',
    signerName: '',
  };
}

function minutesLabel(value: number) {
  if (!value) return '—';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours} Std. ${minutes ? `${minutes} Min.` : ''}` : `${minutes} Min.`;
}

function decimalHours(value: number) {
  return Math.round((value / 60) * 100) / 100;
}

function hoursLabel(value: number) {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })} Std.`;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function WorkReportApp({ isAdmin, personnelOptions, userInitials, userName, userRole }: { isAdmin: boolean; personnelOptions: Array<{ id: string; name: string; role: string }>; userInitials: string; userName: string; userRole: string }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WorkReportDraft>(() => initialDraft(userName, userRole));
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>(demoCustomers);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const [report, setReport] = useState<{ id: string; reportNumber: string; pdfUrl: string } | null>(null);
  const [mail, setMail] = useState({ to: '', subject: '', body: '', senderName: '' });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerInput>(blankNewCustomer);
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [customersSearched, setCustomersSearched] = useState(false);
  const [showAdvancedCustomerSearch, setShowAdvancedCustomerSearch] = useState(false);
  const [customerFilters, setCustomerFilters] = useState<CustomerSearchFilters>(blankCustomerSearch);
  const reportCreationInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/preferences/personnel')
      .then(async (response) => response.ok
        ? await response.json() as { preference?: { name: string; role: string } | null }
        : null)
      .then((payload) => {
        if (!active || !payload?.preference) return;
        setDraft((current) => ({
          ...current,
          personnel: current.personnel.map((row, index) => index === 0 && !row.name
            ? { ...row, name: payload.preference?.name ?? '', role: payload.preference?.role ?? DEFAULT_PERSONNEL_ROLE }
            : row),
        }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      positions: withAutomaticPositions(current.positions, current.personnel, current.distanceKm, current.driveMinutes),
    }));
  }, [draft.distanceKm, draft.driveMinutes, draft.personnel]);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(draft.customer.id);
    if (step === 1) return Boolean(draft.workDate && draft.workAddress.trim() && draft.dictation.trim());
    if (step === 2) return Boolean(draft.workDescription.trim() && draft.personnel.length);
    return Boolean(draft.signerName.trim() && draft.signatureDataUrl);
  }, [draft, step]);

  const totalPersonnelHours = useMemo(
    () => Math.round((draft.personnel.reduce((sum, row) => sum + (Number(row.hours) || 0), 0) + (draft.driveMinutes / 60) * draft.personnel.length) * 100) / 100,
    [draft.driveMinutes, draft.personnel],
  );

  function update<K extends keyof WorkReportDraft>(key: K, value: WorkReportDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function searchCustomers(advanced = false) {
    const value = query.trim();
    if (!advanced && value.length < 2) { setError('Bitte mindestens zwei Zeichen eingeben.'); return; }
    if (advanced && !Object.values(customerFilters).some((entry) => entry.trim())) { setError('Bitte mindestens ein Feld der erweiterten Suche ausfüllen.'); return; }
    setBusy('customers'); setError(''); setNotice('');
    try {
      const parameters = new URLSearchParams(advanced ? { advanced: '1', ...customerFilters } : { q: value });
      const response = await fetch(`/api/customers?${parameters}`);
      const payload = await response.json() as { customers?: Customer[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Kundensuche fehlgeschlagen.');
      setMatches(payload.customers ?? []);
      setCustomersSearched(true);
    } catch (searchError) {
      const normalized = value.toLocaleLowerCase('de');
      setMatches(advanced ? [] : demoCustomers.filter((customer) => `${customer.company} ${customer.fullName} ${customer.city}`.toLocaleLowerCase('de').includes(normalized)));
      setCustomersSearched(true);
      setError(searchError instanceof Error ? searchError.message : 'Kundensuche fehlgeschlagen.');
    } finally { setBusy(''); }
  }

  function applyCustomerExtraction(result: CrmContactExtraction) {
    setNewCustomer((current) => ({
      company: result.company || current.company,
      firstName: result.first_name || current.firstName,
      lastName: result.last_name || current.lastName,
      email: result.email || current.email,
      phone: result.phone || current.phone,
      street: result.street || current.street,
      houseNumber: result.house_number || current.houseNumber,
      zip: result.zip || current.zip,
      city: result.city || current.city,
    }));
    setNotice(result.review_notes.length
      ? `Kundendaten wurden übernommen. Bitte prüfen: ${result.review_notes.join(' · ')}`
      : 'Kundendaten wurden übernommen. Bitte vor der Anlage kurz prüfen.');
    setError('');
  }

  function chooseCustomer(customer: Customer) {
    const contactName = customer.fullName.trim() || `${customer.firstName} ${customer.lastName}`.trim();
    const address = customerAddress(customer);
    setDraft((current) => ({
      ...current,
      customer,
      workAddress: address,
      workEmail: customer.email,
      signerName: contactName,
    }));
    setMail((current) => ({ ...current, to: customer.email }));
    setNotice(`${customer.company || customer.fullName} wurde ausgewählt.`);
    setError('');
    void calculateRoute(address, customer.zip);
    setStep(1);
  }

  async function createNewCustomer(force = false) {
    setBusy('new-customer'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer: newCustomer, force }) });
      const payload = await response.json() as { customer?: Customer; duplicates?: Customer[]; error?: string };
      if (response.status === 409 && payload.duplicates?.length) {
        setDuplicates(payload.duplicates);
        setError('Es wurden mögliche Dubletten gefunden. Bitte vorhandenen Kunden wählen oder die Neuanlage ausdrücklich bestätigen.');
        return;
      }
      if (!response.ok || !payload.customer) throw new Error(payload.error || 'Kunde konnte nicht angelegt werden.');
      chooseCustomer(payload.customer);
      setMatches((current) => [payload.customer as Customer, ...current]);
      setNewCustomer(blankNewCustomer);
      setDuplicates([]);
      setShowNewCustomer(false);
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'Kunde konnte nicht angelegt werden.'); }
    finally { setBusy(''); }
  }

  async function calculateRoute(address = draft.workAddress, postalCode = draft.customer.zip) {
    if (!address.trim()) return;
    setBusy('route'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, postalCode }) });
      const payload = await response.json() as { distanceKm?: number; driveMinutes?: number; provider?: string; usedPostalCodeCenter?: boolean; postalCode?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Routenberechnung fehlgeschlagen.');
      setDraft((current) => {
        const distanceKm = payload.distanceKm ?? 0;
        return {
          ...current,
          distanceKm,
          driveMinutes: payload.driveMinutes ?? 0,
          positions: withAutomaticPositions(current.positions, current.personnel, distanceKm, payload.driveMinutes ?? 0),
        };
      });
      setNotice(payload.usedPostalCodeCenter
        ? `Die genaue Adresse wurde nicht gefunden. Hin- und Rückfahrt wurden deshalb zur Ortsmitte der PLZ ${payload.postalCode || postalCode} berechnet${payload.provider ? ` (${payload.provider})` : ''}.`
        : `Hin- und Rückfahrt wurden berechnet${payload.provider ? ` (${payload.provider})` : ''}.`);
    } catch (routeError) { setError(routeError instanceof Error ? routeError.message : 'Routenberechnung fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  function updateManualDistance(value: string) {
    const distanceKm = Math.max(0, Number(value) || 0);
    setDraft((current) => ({
      ...current,
      distanceKm,
      positions: withAutomaticPositions(current.positions, current.personnel, distanceKm, current.driveMinutes),
    }));
  }

  function applyAnalysis(result: AnalysisResult) {
    setDraft((current) => {
      const personnel = result.workMinutes > 0 && current.personnel.every((row) => !row.hours)
        ? current.personnel.map((row, index) => index === 0 ? { ...row, hours: decimalHours(result.workMinutes) } : row)
        : current.personnel;
      const materials: PositionRow[] = result.materials.map((item) => ({
        id: crypto.randomUUID(),
        quantity: item.quantity,
        unit: item.unit,
        name: item.name,
        sourceType: 'material',
      }));
      return {
        ...current,
        workMinutes: result.workMinutes || current.workMinutes,
        driveMinutes: result.driveMinutes || current.driveMinutes,
        personnel,
        workDescription: result.workDescription,
        positions: withAutomaticPositions(materials, personnel, current.distanceKm, result.driveMinutes || current.driveMinutes),
        findings: result.findings,
        complaints: result.complaints,
        recommendations: result.recommendations,
        internalNotes: result.internalNotes,
      };
    });
  }

  async function analyze() {
    setBusy('analyze'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json() as { result?: AnalysisResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || 'Auswertung fehlgeschlagen.');
      applyAnalysis(payload.result);
      setNotice('Das Diktat wurde strukturiert. Bitte alle Angaben prüfen.');
      setStep(2);
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : 'Auswertung fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  function addPersonnel() {
    setDraft((current) => {
      const personnel = [...current.personnel, { id: crypto.randomUUID(), name: '', role: DEFAULT_PERSONNEL_ROLE, hours: decimalHours(current.workMinutes) }];
      return { ...current, personnel, positions: withAutomaticPositions(current.positions, personnel, current.distanceKm, current.driveMinutes) };
    });
  }

  function updatePersonnel(id: string, patch: Partial<PersonnelRow>) {
    const rowIndex = draft.personnel.findIndex((row) => row.id === id);
    const selectedRow = draft.personnel[rowIndex];
    const nextRow = selectedRow ? { ...selectedRow, ...patch } : null;
    setDraft((current) => {
      const personnel = current.personnel.map((row) => row.id === id ? { ...row, ...patch } : row);
      const workMinutes = patch.hours !== undefined && personnel.length === 1
        ? Math.round(Math.max(0, Number(patch.hours) || 0) * 60)
        : current.workMinutes;
      return {
        ...current,
        personnel,
        workMinutes,
        positions: withAutomaticPositions(current.positions, personnel, current.distanceKm, current.driveMinutes),
      };
    });
    if (rowIndex === 0 && nextRow && (patch.name !== undefined || patch.role !== undefined)) {
      void fetch('/api/preferences/personnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nextRow.name, role: nextRow.role }),
      }).catch(() => undefined);
    }
  }

  function updateWorkHours(value: string) {
    const hours = Math.max(0, Number(value) || 0);
    setDraft((current) => {
      const personnel = current.personnel.length === 1
        ? current.personnel.map((row) => ({ ...row, hours }))
        : current.personnel;
      return {
        ...current,
        workMinutes: Math.round(hours * 60),
        personnel,
        positions: withAutomaticPositions(current.positions, personnel, current.distanceKm, current.driveMinutes),
      };
    });
  }

  function removePersonnel(id: string) {
    setDraft((current) => {
      const personnel = current.personnel.filter((row) => row.id !== id);
      return {
        ...current,
        personnel,
        positions: withAutomaticPositions(current.positions, personnel, current.distanceKm, current.driveMinutes),
      };
    });
  }

  function addPosition() {
    update('positions', [...draft.positions, { id: crypto.randomUUID(), quantity: 1, unit: 'Stück', name: '', sourceType: 'material' }]);
  }

  function updatePosition(id: string, patch: Partial<PositionRow>) {
    setDraft((current) => ({
      ...current,
      positions: current.positions.map((row) => row.id === id ? { ...row, ...patch } : row),
    }));
  }

  async function createReport() {
    if (reportCreationInFlight.current || report) return;
    reportCreationInFlight.current = true;
    let created = false;
    setBusy('report'); setError(''); setReportError(''); setNotice('');
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json() as { id?: string; reportNumber?: string; pdfUrl?: string; pendingReview?: boolean; notified?: boolean; error?: string };
      if (!response.ok || !payload.id || !payload.reportNumber || !payload.pdfUrl) throw new Error(payload.error || 'Arbeitsnachweis konnte nicht erstellt werden.');
      const saved = { id: payload.id, reportNumber: payload.reportNumber, pdfUrl: payload.pdfUrl };
      created = true;
      setReport(saved);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('mifrro-reports');
        channel.postMessage('report-created');
        channel.close();
      }
      if (isAdmin) {
        window.location.assign(`/admin/reports/${encodeURIComponent(saved.id)}`);
        return;
      }
      const senderName = reportSenderName(draft.personnel, userName);
      setMail((current) => ({
        ...current,
        subject: `Arbeitsnachweis ${saved.reportNumber} vom ${new Date(`${draft.workDate}T12:00:00`).toLocaleDateString('de-DE')}`,
        senderName,
        body: buildWorkReportEmailBody({
          customer: draft.customer,
          reportNumber: saved.reportNumber,
          workDate: draft.workDate,
          recommendations: draft.recommendations,
          senderName,
        }),
      }));
      setNotice(payload.pendingReview
        ? `Arbeitsnachweis ${saved.reportNumber} wurde zur Büroprüfung eingereicht${payload.notified === false ? ', die Prüfmail konnte jedoch nicht versendet werden' : ''}.`
        : `Arbeitsnachweis ${saved.reportNumber} wurde gespeichert.`);
      window.setTimeout(() => document.getElementById('report-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Arbeitsnachweis konnte nicht erstellt werden.';
      setError(message);
      setReportError(message);
      window.setTimeout(() => document.getElementById('report-save-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
    finally {
      if (!created) reportCreationInFlight.current = false;
      setBusy('');
    }
  }

  async function sendMail() {
    if (!report) return;
    setBusy('mail'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/reports/${report.id}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mail) });
      const payload = await response.json() as { sent?: boolean; error?: string };
      if (!response.ok || !payload.sent) throw new Error(payload.error || 'E-Mail konnte nicht versendet werden.');
      setNotice(`Die E-Mail wurde an ${mail.to} versendet.`);
    } catch (mailError) { setError(mailError instanceof Error ? mailError.message : 'E-Mail konnte nicht versendet werden.'); }
    finally { setBusy(''); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  async function goNext() {
    setError(''); setNotice('');
    if (step === 1) {
      await analyze();
    }
    else if (step < 3) setStep(step + 1);
  }

  const stepTitles = ['Kunde auswählen', 'Einsatz erfassen', 'Leistungen prüfen', 'Freigabe und Versand'];
  const stepDescriptions = ['Suche nach Firma, Ansprechpartner oder Adresse.', 'Erfasse Einsatzort, Fahrtdaten und deinen Arbeitsbericht.', 'Kontrolliere Mitarbeiter, Zeiten, Material und Berichtstexte.', 'Lass den Kunden unterschreiben und erstelle die PDF.'];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a aria-label="Zur Startseite" className="brand-lockup brand-home-link" href="/"><span className="brand-mark" aria-hidden="true">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">Arbeitsnachweis</p></div></a>
        <div className="topbar-actions"><span className="sync-state"><i /> {report ? report.reportNumber : 'Entwurf gespeichert'}</span>{isAdmin ? <a className="admin-link" href="/admin">Verwaltung</a> : null}<button className="user-button" onClick={() => void logout()} title={`${userName} – abmelden`} type="button" aria-label={`${userName} abmelden`}>{userInitials}</button></div>
      </header>

      <div className="workspace">
        <aside className="step-sidebar" aria-label="Fortschritt des Arbeitsnachweises">
          <div className="new-report-copy"><span className="eyebrow">Neuer Vorgang</span><strong>Arbeitsnachweis</strong><small>{draft.customer.id ? draft.customer.company || draft.customer.fullName : 'Noch kein Kunde'}</small></div>
          <ol className="step-list">
            {steps.map((item, index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} key={item.title} onClick={() => index <= step && setStep(index)}><span>{index < step ? '✓' : index + 1}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div></li>)}
          </ol>
          <div className="help-card"><span aria-hidden="true">?</span><div><strong>Unterstützung</strong><small>Bei Fragen zum Nachweis</small></div></div>
        </aside>

        <section className="content-area">
          <div className="content-heading"><div><span className="eyebrow">Schritt {step + 1} von 4</span><h1>{stepTitles[step]}</h1><p>{stepDescriptions[step]}</p></div><button className="ghost-button" type="button">Entwürfe <span>3</span></button></div>

          {error ? <div className="alert error-alert">{error}</div> : null}
          {notice ? <div className="alert success-alert">{notice}</div> : null}

          {step === 0 ? <>
            <div className="search-card">
              <label htmlFor="customer-search">Kundensuche</label>
              <div className="search-row"><div className="search-input-wrap"><span aria-hidden="true" className="search-symbol">⌕</span><input id="customer-search" onChange={(event) => { setQuery(event.target.value); setCustomersSearched(false); }} onKeyDown={(event) => event.key === 'Enter' && void searchCustomers()} placeholder="Firma, Name, Straße oder Ort" type="search" value={query}/>{query ? <button aria-label="Suche leeren" className="clear-search" onClick={() => { setQuery(''); setCustomersSearched(false); }} type="button">×</button> : null}</div><button className="primary-button" disabled={busy === 'customers'} onClick={() => void searchCustomers()} type="button">{busy === 'customers' ? 'Suche …' : 'Kunde prüfen'}</button></div>
              <div className="search-card-actions"><p className="search-note">Die Kundendaten werden direkt mit Plenty abgeglichen.</p><button className="text-button" onClick={() => setShowAdvancedCustomerSearch((current) => !current)} type="button">{showAdvancedCustomerSearch ? 'Einfache Suche' : 'Erweiterte Suche'}</button></div>
              {showAdvancedCustomerSearch ? <div className="advanced-customer-search"><div className="form-grid customer-search-grid"><Field label="Kundennummer"><input value={customerFilters.number} onChange={(event) => setCustomerFilters({ ...customerFilters, number: event.target.value })}/></Field><Field label="Firma"><input value={customerFilters.company} onChange={(event) => setCustomerFilters({ ...customerFilters, company: event.target.value })}/></Field><Field label="Ansprechpartner"><input value={customerFilters.contact} onChange={(event) => setCustomerFilters({ ...customerFilters, contact: event.target.value })}/></Field><Field label="E-Mail"><input type="email" value={customerFilters.email} onChange={(event) => setCustomerFilters({ ...customerFilters, email: event.target.value })}/></Field><Field label="Telefon"><input value={customerFilters.phone} onChange={(event) => setCustomerFilters({ ...customerFilters, phone: event.target.value })}/></Field><Field label="PLZ"><input value={customerFilters.zip} onChange={(event) => setCustomerFilters({ ...customerFilters, zip: event.target.value })}/></Field><Field label="Ort"><input value={customerFilters.city} onChange={(event) => setCustomerFilters({ ...customerFilters, city: event.target.value })}/></Field></div><button className="secondary-button" disabled={busy === 'customers'} onClick={() => void searchCustomers(true)} type="button">Erweitert in Plenty suchen</button></div> : null}
            </div>
            <div className="results-heading"><div><h2>{showNewCustomer ? 'Neukunde' : customersSearched ? 'Suchergebnisse' : 'Zuletzt verwendet'}</h2><p>{showNewCustomer ? 'Wird erst nach Bestätigung in Plenty angelegt' : `${matches.length} ${matches.length === 1 ? 'Kunde' : 'Kunden'}`}</p></div><button className="text-button" onClick={() => { setShowNewCustomer(!showNewCustomer); setDuplicates([]); setError(''); }} type="button">{showNewCustomer ? 'Abbrechen' : '+ Neuen Kunden anlegen'}</button></div>
            {showNewCustomer ? <div className="form-card new-customer-card">
              <ContactCapture endpoint="/api/customers/extract" onExtract={applyCustomerExtraction} description="Fotografiere zum Beispiel einen Briefkopf oder diktiere die Kontaktdaten. Danach prüfst du alle Felder, bevor der Kunde in Plenty angelegt wird."/>
              <div className="form-grid two-col"><Field label="Firma"><input value={newCustomer.company} onChange={(event) => setNewCustomer({ ...newCustomer, company: event.target.value })}/></Field><span/><Field label="Vorname"><input value={newCustomer.firstName} onChange={(event) => setNewCustomer({ ...newCustomer, firstName: event.target.value })}/></Field><Field label="Nachname"><input value={newCustomer.lastName} onChange={(event) => setNewCustomer({ ...newCustomer, lastName: event.target.value })}/></Field><Field label="Straße"><input value={newCustomer.street} onChange={(event) => setNewCustomer({ ...newCustomer, street: event.target.value })}/></Field><Field label="Hausnummer"><input value={newCustomer.houseNumber} onChange={(event) => setNewCustomer({ ...newCustomer, houseNumber: event.target.value })}/></Field><Field label="PLZ"><input value={newCustomer.zip} onChange={(event) => setNewCustomer({ ...newCustomer, zip: event.target.value })}/></Field><Field label="Ort"><input value={newCustomer.city} onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })}/></Field><Field label="E-Mail"><input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })}/></Field><Field label="Telefon"><input value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}/></Field></div>
              {duplicates.length ? <div className="duplicate-box"><strong>Mögliche bestehende Kunden</strong>{duplicates.map((customer) => <button key={customer.id} onClick={() => { chooseCustomer(customer); setShowNewCustomer(false); }} type="button">{customer.company || customer.fullName} · {customerAddress(customer)}</button>)}<button className="danger-button" disabled={busy === 'new-customer'} onClick={() => createNewCustomer(true)} type="button">Trotzdem ausdrücklich neu anlegen</button></div> : <button className="primary-button full-button" disabled={busy === 'new-customer'} onClick={() => createNewCustomer(false)} type="button">{busy === 'new-customer' ? 'Wird geprüft …' : 'Dubletten prüfen und Kunden anlegen'}</button>}
            </div> : <div className="customer-list">
              {customersSearched && !matches.length ? <div className="customer-not-found"><span className="customer-avatar">?</span><div><strong>Kunde ist nicht vorhanden</strong><p>Versuche die erweiterte Plenty-Suche oder erfasse den Kunden direkt per Diktat, Text oder Foto.</p></div><div><button className="secondary-button" onClick={() => setShowAdvancedCustomerSearch(true)} type="button">Erweiterte Suche</button><button className="primary-button" onClick={() => setShowNewCustomer(true)} type="button">Kunden neu anlegen</button></div></div> : null}
              {matches.map((customer) => <button className={`customer-card${draft.customer.id === customer.id ? ' selected' : ''}`} key={customer.id} onClick={() => chooseCustomer(customer)} type="button"><span className="customer-avatar">{(customer.company || customer.fullName).slice(0, 1)}</span><span className="customer-main"><strong>{customer.company || customer.fullName}</strong>{customer.company && customer.fullName ? <small>Ansprechpartner: {customer.fullName}</small> : null}<small>{customer.street} {customer.houseNumber}, {customer.zip} {customer.city}</small><span className="customer-contact"><small>Tel.: {customer.phone || 'nicht hinterlegt'}</small><small>E-Mail: {customer.email || 'nicht hinterlegt'}</small></span></span><span className="customer-id">Kunde {customer.number || customer.id}</span><span className="card-arrow" aria-hidden="true">→</span></button>)}
            </div>}
          </> : null}

          {step === 1 ? <div className="form-stack">
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Einsatzdaten</span><h2>Ort und Kontakt</h2></div><span className="customer-chip">{draft.customer.company || draft.customer.fullName}</span></div><div className="form-grid two-col"><Field label="Einsatzdatum"><input type="date" value={draft.workDate} onChange={(event) => update('workDate', event.target.value)}/></Field><Field label="E-Mail für den Nachweis"><input type="email" value={draft.workEmail} onChange={(event) => update('workEmail', event.target.value)}/></Field></div><Field label="Einsatzadresse"><input value={draft.workAddress} onBlur={() => void calculateRoute()} onChange={(event) => update('workAddress', event.target.value)}/></Field><p className="route-origin">Hin- und Rückfahrt ab Mifrro: {MIFRRO_ORIGIN_ADDRESS}</p><div className="route-row"><label><span>Gesamtkilometer (Hin und zurück)</span><input aria-label="Gesamtkilometer manuell" min="0" step="0.1" type="number" value={draft.distanceKm || ''} onChange={(event) => updateManualDistance(event.target.value)} placeholder="km eingeben"/></label><label><span>Fahrzeit gesamt (Minuten)</span><input aria-label="Fahrzeit manuell" min="0" step="1" type="number" value={draft.driveMinutes || ''} onChange={(event) => update('driveMinutes', Math.max(0, Number(event.target.value) || 0))} placeholder="Minuten eingeben"/></label><button className="secondary-button" disabled={busy === 'route'} onClick={() => void calculateRoute()} type="button">{busy === 'route' ? 'Berechne …' : 'Neu berechnen'}</button></div><p className="route-manual-hint">Die Berechnung startet bei der Kundenauswahl automatisch. Nach einer Adressänderung wird beim Verlassen des Feldes neu berechnet. Falls die genaue Anschrift nicht gefunden wird, verwendet die App die Ortsmitte der PLZ. Kilometer und Fahrzeit können außerdem immer von Hand eingetragen werden. Kartendaten: © OpenStreetMap-Mitwirkende.</p></div>
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Arbeitsbericht</span><h2>Diktat oder Texteingabe</h2></div><span className="ai-badge">Auswertung bei „Weiter“</span></div><Field label="Was wurde vor Ort gemacht?" hint="Mengen, Zeiten, Materialien und technische Bezeichnungen möglichst genau nennen. Beim Weitergehen wird der Text automatisch ausgewertet."><textarea className="dictation-input" value={draft.dictation} onChange={(event) => update('dictation', event.target.value)} placeholder="Beispiel: Anlage geprüft, Filter gereinigt, 1,2 kg R32 nachgefüllt …"/></Field></div>
          </div> : null}

          {step === 2 ? <div className="form-stack">
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Team</span><h2>Mitarbeiter und Zeiten</h2></div><button className="text-button" onClick={addPersonnel} type="button">+ Mitarbeiter</button></div><div className="time-overview"><Field label="Arbeitszeit vor Ort (Stunden)"><input min="0" step="0.25" type="number" value={decimalHours(draft.workMinutes) || ''} onChange={(event) => updateWorkHours(event.target.value)}/></Field><div><span>Abrechenbare Personalstunden</span><strong>{hoursLabel(totalPersonnelHours)}</strong><small>Arbeitszeit vor Ort plus Fahrzeit je Mitarbeiter</small></div></div><div className="editable-list"><div aria-hidden="true" className="editable-row personnel-row personnel-labels"><span>Mitarbeiter (optional)</span><span>Rolle</span><span>Stunden vor Ort</span><span/></div>{draft.personnel.map((row) => <div className="editable-row personnel-row" key={row.id}><select aria-label="Mitarbeiter (optional)" value={row.name} onChange={(event) => { const name = event.target.value; const selected = personnelOptions.find((item) => item.name === name); updatePersonnel(row.id, { name, role: selected?.role || row.role }); }}><option value="">– Mitarbeiter auswählen –</option>{personnelOptions.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}</select><select aria-label="Rolle" value={row.role} onChange={(event) => updatePersonnel(row.id, { role: event.target.value })}>{PERSONNEL_ROLES.map((role) => <option key={role}>{role}</option>)}</select><input aria-label="Stunden vor Ort" min="0" step="0.25" type="number" value={row.hours || ''} onChange={(event) => updatePersonnel(row.id, { hours: Number(event.target.value) })}/><button aria-label="Mitarbeiter entfernen" onClick={() => removePersonnel(row.id)} type="button">×</button></div>)}</div></div>
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Positionen</span><h2>Anfahrt, Arbeitszeit und Material</h2></div><button className="text-button" onClick={addPosition} type="button">+ Position</button></div><div className="editable-list">{draft.positions.length ? draft.positions.map((row) => { const automatic = row.sourceType === 'route' || row.sourceType === 'labor'; return <div className={`position-block${automatic ? ' automatic-position' : ''}`} key={row.id}>{automatic ? <div className="position-source"><strong>{row.sourceType === 'route' ? 'Anfahrt' : 'Arbeitszeit'}</strong><small>{row.sourceType === 'route' ? 'Wird aus den Kilometern gewählt und kann manuell geändert werden.' : 'Wird automatisch aus den Mitarbeiterstunden aktualisiert.'}</small></div> : null}<div className="editable-row position-row"><input aria-label="Menge" min="0" readOnly={automatic} step="0.1" type="number" value={row.quantity} onChange={(event) => updatePosition(row.id, { quantity: Number(event.target.value) })}/><input aria-label="Einheit" readOnly={automatic} value={row.unit} onChange={(event) => updatePosition(row.id, { unit: event.target.value })}/><input aria-label="Bezeichnung" readOnly={automatic} value={row.name} onChange={(event) => updatePosition(row.id, { name: event.target.value })}/>{automatic ? <span aria-hidden="true" className="position-lock">✓</span> : <button aria-label="Position entfernen" onClick={() => update('positions', draft.positions.filter((item) => item.id !== row.id))} type="button">×</button>}</div>{row.sourceType === 'route' ? <label className="route-article-select"><span>Anfahrtspauschale manuell auswählen</span><select aria-label="Anfahrtspauschale manuell auswählen" value={row.variationId || ''} onChange={(event) => { const article = ROUTE_ARTICLES.find((item) => item.variationId === event.target.value); if (article) updatePosition(row.id, { name: article.name, variationId: article.variationId }); }}><option value="">Bitte auswählen</option>{ROUTE_ARTICLES.map((article) => <option key={article.variationId} value={article.variationId}>{article.name}</option>)}</select></label> : row.sourceType !== 'labor' ? <ArticleSearch initialQuery={row.name} onPick={(article) => updatePosition(row.id, { name: article.title || article.variationName, itemId: article.itemId, variationId: article.variationId })}/> : null}{row.variationId ? <small className="selected-article">{row.itemId ? `Plenty-Artikel ${row.itemId} · ` : ''}Variante {row.variationId} {row.sourceType === 'labor' ? 'fest ' : ''}zugeordnet</small> : null}</div>; }) : <div className="list-empty">Noch keine Positionen. Arbeitszeit und Anfahrt werden automatisch ergänzt.</div>}</div></div>
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Bericht</span><h2>Kundentext prüfen</h2></div></div><Field label="Ausgeführte Arbeiten"><textarea value={draft.workDescription} onChange={(event) => update('workDescription', event.target.value)}/></Field><div className="form-grid two-col"><Field label="Feststellungen"><textarea value={draft.findings} onChange={(event) => update('findings', event.target.value)}/></Field><Field label="Beanstandungen"><textarea value={draft.complaints} onChange={(event) => update('complaints', event.target.value)}/></Field><Field label="Empfehlungen"><textarea value={draft.recommendations} onChange={(event) => update('recommendations', event.target.value)}/></Field><Field label="Interne Notiz" hint="Erscheint nicht in der Kunden-PDF."><textarea value={draft.internalNotes} onChange={(event) => update('internalNotes', event.target.value)}/></Field></div></div>
          </div> : null}

          {step === 3 ? <div className="form-stack">
            <div className="summary-grid"><div className="summary-card"><span>Kunde</span><strong>{draft.customer.company || draft.customer.fullName}</strong><small>{customerAddress(draft.customer)}</small></div><div className="summary-card"><span>Einsatz</span><strong>{new Date(`${draft.workDate}T12:00:00`).toLocaleDateString('de-DE')}</strong><small>{minutesLabel(draft.workMinutes)} vor Ort + {minutesLabel(draft.driveMinutes)} Fahrt · {draft.distanceKm.toLocaleString('de-DE')} km</small></div><div className="summary-card"><span>Arbeitszeit gesamt</span><strong>{hoursLabel(totalPersonnelHours)}</strong><small>Vor-Ort-Zeit plus Fahrzeit je Mitarbeiter</small></div></div>
            <div className="form-card"><div className="form-card-head"><div><span className="card-kicker">Kundenfreigabe</span><h2>Unterschrift</h2></div><span className="secure-badge">Verbindlich gespeichert</span></div><Field label="Vor- und Nachname der unterschreibenden Person" hint="Wird aus den Kundendaten vorausgefüllt und kann bei Bedarf geändert werden."><input value={draft.signerName} onChange={(event) => update('signerName', event.target.value)} placeholder="Vor- und Nachname"/></Field><SignaturePad onChange={(value) => update('signatureDataUrl', value)}/><label className="consent-line"><input type="checkbox" defaultChecked/> <span>Die ausgeführten Arbeiten und aufgeführten Positionen wurden geprüft.</span></label>{reportError ? <div className="alert error-alert" id="report-save-error"><strong>PDF konnte nicht gespeichert werden.</strong><br/>{reportError}</div> : null}<button className="analyze-button" disabled={!canContinue || busy === 'report' || Boolean(report)} onClick={createReport} type="button">{busy === 'report' ? 'PDF wird erstellt …' : report ? `${report.reportNumber} erstellt` : 'Unterschreiben und PDF erstellen →'}</button></div>
            {report ? isAdmin ? <div className="form-card mail-card" id="report-result"><div className="form-card-head"><div><span className="card-kicker">Fertig</span><h2>PDF und E-Mail</h2></div><a className="pdf-link" href={`/reports/${report.id}/preview`} rel="opener" target="_blank">PDF ansehen</a></div><Field label="Empfänger"><input type="email" value={mail.to} onChange={(event) => setMail({ ...mail, to: event.target.value })}/></Field><Field label="Betreff"><input value={mail.subject} onChange={(event) => setMail({ ...mail, subject: event.target.value })}/></Field><Field label="Absender"><input value={mail.senderName} onChange={(event) => setMail({ ...mail, senderName: event.target.value })}/></Field><Field label="Nachricht"><textarea value={mail.body} onChange={(event) => setMail({ ...mail, body: event.target.value })}/></Field><button className="primary-button full-button" disabled={busy === 'mail'} onClick={sendMail} type="button">{busy === 'mail' ? 'Wird versendet …' : 'Arbeitsnachweis per E-Mail senden'}</button></div> : <div className="form-card review-submitted" id="report-result"><span className="card-kicker">An das Büro übermittelt</span><h2>Arbeitsnachweis wartet auf Prüfung</h2><p>Du bist fertig. Das Büro wurde per E-Mail informiert, prüft den unterschriebenen Nachweis und versendet ihn anschließend an den Kunden.</p><a className="pdf-link" href={`/reports/${report.id}/preview`} rel="opener" target="_blank">PDF ansehen</a></div> : null}
          </div> : null}

          <footer className="content-footer"><button className="back-button" disabled={step === 0 || busy === 'analyze'} onClick={() => setStep(Math.max(0, step - 1))} type="button">← Zurück</button><span>{draft.customer.id ? draft.customer.company || draft.customer.fullName : 'Bitte zuerst einen Kunden auswählen'}</span>{step < 3 ? <button className="continue-button" disabled={!canContinue || busy === 'analyze'} onClick={() => void goNext()} type="button">{busy === 'analyze' ? 'Wird ausgewertet …' : 'Weiter'} <span>→</span></button> : <span/>}</footer>
        </section>
      </div>
    </main>
  );
}
