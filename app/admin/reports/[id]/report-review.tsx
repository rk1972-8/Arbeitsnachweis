'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ArticleMatch } from '../../../../lib/types';
import { ArticleSearch } from '../../../article-search';

type Report = {
  report_number: string; status: string; customer_company: string; customer_name: string; customer_email: string;
  customer_address: string; work_date: string; employee_name: string; recommendations: string;
};
type Addition = { id: string; quantity: number; unit: string; title: string; item_id: string | null; variation_id: string | null; reason: string; added_by: string; created_at: string };

export function ReportReview({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('Stück');
  const [title, setTitle] = useState('');
  const [itemId, setItemId] = useState('');
  const [variationId, setVariationId] = useState('');
  const [reason, setReason] = useState('');
  const [mail, setMail] = useState({ to: '', subject: '', body: '', senderName: 'Rolf Köhler' });
  const [pdfVersion, setPdfVersion] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/reports/${reportId}`);
    const payload = await response.json() as { report?: Report; additions?: Addition[]; error?: string };
    if (!response.ok || !payload.report) { setError(payload.error || 'Arbeitsnachweis nicht gefunden.'); return; }
    setReport(payload.report); setAdditions(payload.additions ?? []);
    const date = new Date(`${payload.report.work_date}T12:00:00`).toLocaleDateString('de-DE');
    const greeting = payload.report.customer_name ? `Guten Tag ${payload.report.customer_name},` : 'Sehr geehrte Damen und Herren,';
    const outstanding = payload.report.recommendations?.trim() ? `\n\nFolgende weitere Arbeiten wurden vor Ort besprochen beziehungsweise sind noch zu erledigen:\n${payload.report.recommendations.trim()}` : '';
    setMail((current) => ({ ...current, to: payload.report!.customer_email, subject: `Arbeitsnachweis ${payload.report!.report_number} vom ${date}`, body: `${greeting}\n\nim Anhang übermitteln wir Ihnen unseren Arbeitsnachweis ${payload.report!.report_number} vom ${date}.${outstanding}\n\nFür Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nRolf Köhler` }));
  }, [reportId]);

  useEffect(() => { void load(); }, [load]);

  async function addPosition(event: React.FormEvent) {
    event.preventDefault(); setBusy('addition'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/additions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: Number(quantity), unit, title, itemId, variationId, reason }) });
      const payload = await response.json() as { added?: boolean; error?: string };
      if (!response.ok || !payload.added) throw new Error(payload.error || 'Nachtrag konnte nicht gespeichert werden.');
      setTitle(''); setItemId(''); setVariationId(''); setReason(''); setPdfVersion((value) => value + 1); await load(); setNotice('Der Büro-Nachtrag wurde als separate Seite angefügt.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nachtrag konnte nicht gespeichert werden.'); }
    finally { setBusy(''); }
  }

  async function send() {
    setBusy('send'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/reports/${reportId}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mail) });
      const payload = await response.json() as { sent?: boolean; error?: string };
      if (!response.ok || !payload.sent) throw new Error(payload.error || 'E-Mail konnte nicht versendet werden.');
      setNotice(`Der geprüfte Arbeitsnachweis wurde an ${mail.to} versendet; info@mifrro.de erhält eine Kopie.`);
      setReport((current) => current ? { ...current, status: 'sent' } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'E-Mail konnte nicht versendet werden.'); }
    finally { setBusy(''); }
  }

  function pickArticle(article: ArticleMatch) {
    const variant = article.variationName || article.model;
    setTitle([article.title, variant && variant !== article.title ? variant : ''].filter(Boolean).join(' · '));
    setItemId(article.itemId);
    setVariationId(article.variationId);
    setNotice(`Plenty-Artikel ${article.itemId}, Variante ${article.variationId} wurde ausgewählt.`);
  }

  if (!report) return <main className="admin-shell"><section className="admin-content">{error ? <div className="alert error-alert">{error}</div> : <p>Arbeitsnachweis wird geladen …</p>}</section></main>;
  return <main className="admin-shell"><header className="admin-topbar"><div className="brand-lockup"><span className="brand-mark">M</span><div><p className="brand-name">{report.report_number}</p><p className="brand-product">Prüfung vor Kundenversand</p></div></div><div className="admin-nav"><a href="/admin">← Verwaltung</a></div></header>
    <section className="review-layout"><div className="review-sidebar"><span className="status-pill">{report.status === 'sent' ? 'Versendet' : 'Zu prüfen'}</span><h1>{report.customer_company || report.customer_name}</h1><p>{report.customer_name}<br/>{report.customer_address}</p><dl><div><dt>Mitarbeiter</dt><dd>{report.employee_name}</dd></div><div><dt>Einsatzdatum</dt><dd>{new Date(`${report.work_date}T12:00:00`).toLocaleDateString('de-DE')}</dd></div></dl>
      <div className="integrity-note"><strong>Unterschrift bleibt geschützt</strong><p>Der unterschriebene Originalnachweis wird nicht verändert. Ergänzungen erscheinen ausschließlich auf der gesonderten Nachtragsseite.</p></div>
      {report.status !== 'sent' ? <form className="addition-form" onSubmit={addPosition}><span className="card-kicker">Büro-Nachtrag</span><h2>Position ergänzen</h2><ArticleSearch initialQuery={title} onPick={pickArticle}/>{itemId || variationId ? <small className="selected-article">Ausgewählt: Plenty-Artikel {itemId || '–'} · Variante {variationId || '–'}</small> : null}<div className="addition-amount"><label><span>Menge</span><input min="0.01" step="0.01" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Einheit</span><input value={unit} onChange={(event) => setUnit(event.target.value)} /></label></div><label><span>Bezeichnung</span><input value={title} onChange={(event) => { setTitle(event.target.value); setItemId(''); setVariationId(''); }} required /></label><label><span>Begründung / Hinweis</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Warum wurde diese Position nachgetragen?" /></label><button className="primary-button full-button" disabled={busy === 'addition'} type="submit">Nachtrag an PDF anfügen</button></form> : null}
      {additions.length ? <div className="addition-list"><strong>Nachträge</strong>{additions.map((item) => <div key={item.id}><b>{item.quantity} {item.unit} · {item.title}</b><small>{item.item_id || item.variation_id ? `Plenty-Artikel ${item.item_id || '–'} · Variante ${item.variation_id || '–'}\n` : ''}{item.reason || 'Ohne weitere Anmerkung'}<br/>{item.added_by}</small></div>)}</div> : null}
      {error ? <div className="alert error-alert">{error}</div> : null}{notice ? <div className="alert success-alert">{notice}</div> : null}
      {report.status !== 'sent' ? <div className="review-mail"><h2>An Kunden senden</h2><label><span>Empfänger</span><input type="email" value={mail.to} onChange={(event) => setMail({ ...mail, to: event.target.value })}/></label><label><span>Betreff</span><input value={mail.subject} onChange={(event) => setMail({ ...mail, subject: event.target.value })}/></label><label><span>Nachricht</span><textarea value={mail.body} onChange={(event) => setMail({ ...mail, body: event.target.value })}/></label><button className="primary-button full-button" disabled={busy === 'send'} onClick={() => void send()} type="button">{busy === 'send' ? 'Wird versendet …' : 'Geprüft an Kunden senden'}</button><small>Kopie automatisch an info@mifrro.de</small></div> : null}</div>
      <div className="review-pdf"><iframe key={pdfVersion} src={`/api/reports/${reportId}/pdf?v=${pdfVersion}`} title="Arbeitsnachweis PDF" /></div></section>
  </main>;
}
