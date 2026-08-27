'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArticleMatch, OrderAddress, PlentyOrderDraft, PlentyOrderPosition } from '../../../../../lib/types';
import { ArticleSearch } from '../../../../article-search';

function money(value: number) {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function addressLine(address: OrderAddress) {
  return `${address.street} ${address.houseNumber}, ${address.zip} ${address.city}`.replace(/\s+,/g, ',').trim();
}

export function OrderEditor({ reportId }: { reportId: string }) {
  const [draft, setDraft] = useState<PlentyOrderDraft | null>(null);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy('load'); setError('');
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/order`, { cache: 'no-store' });
      const payload = await response.json() as { draft?: PlentyOrderDraft; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error || 'Auftragsentwurf konnte nicht geladen werden.');
      setDraft(payload.draft);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Auftragsentwurf konnte nicht geladen werden.'); }
    finally { setBusy(''); }
  }, [reportId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const total = useMemo(() => draft?.positions.reduce((sum, position) => sum + position.quantity * (position.priceGross ?? 0), 0) ?? 0, [draft]);
  const incomplete = useMemo(() => draft?.positions.filter((position) => !position.variationId || position.priceGross === null) ?? [], [draft]);

  function updateAddress(kind: 'billingAddress' | 'deliveryAddress', patch: Partial<OrderAddress>) {
    setDraft((current) => current ? { ...current, [kind]: { ...current[kind], ...patch, addressId: undefined } } : current);
  }

  function updatePosition(id: string, patch: Partial<PlentyOrderPosition>) {
    setDraft((current) => current ? { ...current, positions: current.positions.map((position) => position.id === id ? { ...position, ...patch } : position) } : current);
  }

  function movePosition(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.positions.length) return current;
      const positions = [...current.positions];
      [positions[index], positions[target]] = [positions[target], positions[index]];
      return { ...current, positions };
    });
  }

  function chooseArticle(positionId: string, article: ArticleMatch) {
    const variant = article.variationName || article.model;
    updatePosition(positionId, {
      title: [article.title, variant && variant !== article.title ? variant : ''].filter(Boolean).join(' · '),
      itemId: article.itemId,
      variationId: article.variationId,
      priceGross: article.priceGross ?? null,
      currency: article.currency || 'EUR',
    });
    setNotice(`Plenty-Artikel ${article.itemId}, Variante ${article.variationId} wurde übernommen.`);
    setError('');
  }

  function addPosition() {
    setDraft((current) => current ? {
      ...current,
      positions: [...current.positions, { id: crypto.randomUUID(), quantity: 1, unit: 'Stück', title: '', itemId: '', variationId: '', priceGross: null, currency: 'EUR' }],
    } : current);
  }

  async function save() {
    if (!draft) return;
    setBusy('save'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/order`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json() as { saved?: boolean; draft?: PlentyOrderDraft; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || 'Entwurf konnte nicht gespeichert werden.');
      if (payload.draft) setDraft(payload.draft);
      setNotice('Der Auftragsentwurf wurde gespeichert.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Entwurf konnte nicht gespeichert werden.'); }
    finally { setBusy(''); }
  }

  async function submit() {
    if (!draft || !window.confirm('Den geprüften Auftrag jetzt verbindlich in Plenty anlegen?')) return;
    setBusy('submit'); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json() as { created?: boolean; orderId?: string; draft?: PlentyOrderDraft; error?: string };
      if (!response.ok || !payload.created || !payload.draft) throw new Error(payload.error || 'Plenty-Auftrag konnte nicht angelegt werden.');
      setDraft(payload.draft);
      setNotice(`Der Auftrag ${payload.orderId} wurde erfolgreich in Plenty angelegt.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Plenty-Auftrag konnte nicht angelegt werden.'); }
    finally { setBusy(''); }
  }

  if (!draft) return <main className="admin-shell"><header className="admin-topbar"><div className="brand-lockup"><span className="brand-mark">M</span><div><p className="brand-name">mifrro</p><p className="brand-product">Plenty-Auftrag</p></div></div><div className="admin-nav"><a href={`/admin/reports/${reportId}`}>← Arbeitsnachweis</a></div></header><section className="admin-content">{error ? <div className="alert error-alert">{error}</div> : <p>{busy === 'load' ? 'Auftragsentwurf wird vorbereitet …' : 'Auftragsentwurf ist nicht verfügbar.'}</p>}</section></main>;

  const locked = draft.status === 'created';
  return <main className="admin-shell">
    <header className="admin-topbar"><div className="brand-lockup"><span className="brand-mark">M</span><div><p className="brand-name">{draft.reportNumber}</p><p className="brand-product">Auftrag für Plenty vorbereiten</p></div></div><div className="admin-nav"><a href={`/admin/reports/${reportId}`}>← Arbeitsnachweis</a><a href="/admin">Verwaltung</a></div></header>
    <section className="order-editor-shell">
      <div className="order-editor-heading"><div><span className="eyebrow">Getrennt von der unterschriebenen PDF</span><h1>Auftrag anlegen</h1><p>Adresse, Artikel, Preise und Reihenfolge prüfen. Erst die letzte Schaltfläche übergibt den Auftrag an Plenty.</p></div><div className="order-total"><span>Bruttosumme</span><strong>{money(total)}</strong><small>{draft.positions.length} Positionen</small></div></div>
      {error ? <div className="alert error-alert">{error}</div> : null}
      {notice ? <div className="alert success-alert">{notice}</div> : null}
      {locked ? <div className="order-created-banner"><div><span>In Plenty angelegt</span><strong>Auftrag {draft.plentyOrderId}</strong></div><p>Dieser übergebene Stand ist hier schreibgeschützt. Änderungen erfolgen jetzt direkt im Plenty-Auftrag.</p></div> : null}

      <div className="order-editor-grid">
        <section className="order-card"><span className="card-kicker">Auftraggeber</span><h2>Rechnungsadresse</h2><div className="order-address-grid"><label className="wide"><span>Firma</span><input disabled={locked} value={draft.billingAddress.company} onChange={(event) => updateAddress('billingAddress', { company: event.target.value })}/></label><label><span>Vorname</span><input disabled={locked} value={draft.billingAddress.firstName} onChange={(event) => updateAddress('billingAddress', { firstName: event.target.value })}/></label><label><span>Nachname</span><input disabled={locked} value={draft.billingAddress.lastName} onChange={(event) => updateAddress('billingAddress', { lastName: event.target.value })}/></label><label className="street"><span>Straße</span><input disabled={locked} value={draft.billingAddress.street} onChange={(event) => updateAddress('billingAddress', { street: event.target.value })}/></label><label><span>Hausnummer</span><input disabled={locked} value={draft.billingAddress.houseNumber} onChange={(event) => updateAddress('billingAddress', { houseNumber: event.target.value })}/></label><label><span>PLZ</span><input disabled={locked} value={draft.billingAddress.zip} onChange={(event) => updateAddress('billingAddress', { zip: event.target.value })}/></label><label className="city"><span>Ort</span><input disabled={locked} value={draft.billingAddress.city} onChange={(event) => updateAddress('billingAddress', { city: event.target.value })}/></label></div></section>

        <section className="order-card"><span className="card-kicker">Ausführungsort / Lieferung</span><h2>Wie Rechnungsadresse?</h2><label className="same-address-select"><span>Ausführungsort beziehungsweise Lieferadresse ist identisch</span><select disabled={locked} value={draft.deliverySameAsBilling ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, deliverySameAsBilling: event.target.value === 'yes' })}><option value="yes">Ja</option><option value="no">Nein</option></select></label>{draft.deliverySameAsBilling ? <div className="same-address-preview"><strong>{draft.customerLabel}</strong><span>{addressLine(draft.billingAddress)}</span></div> : <div className="order-address-grid delivery-fields"><label className="wide"><span>Firma / Empfänger</span><input disabled={locked} value={draft.deliveryAddress.company} onChange={(event) => updateAddress('deliveryAddress', { company: event.target.value })}/></label><label><span>Vorname</span><input disabled={locked} value={draft.deliveryAddress.firstName} onChange={(event) => updateAddress('deliveryAddress', { firstName: event.target.value })}/></label><label><span>Nachname</span><input disabled={locked} value={draft.deliveryAddress.lastName} onChange={(event) => updateAddress('deliveryAddress', { lastName: event.target.value })}/></label><label className="street"><span>Straße</span><input disabled={locked} value={draft.deliveryAddress.street} onChange={(event) => updateAddress('deliveryAddress', { street: event.target.value })}/></label><label><span>Hausnummer</span><input disabled={locked} value={draft.deliveryAddress.houseNumber} onChange={(event) => updateAddress('deliveryAddress', { houseNumber: event.target.value })}/></label><label><span>PLZ</span><input disabled={locked} value={draft.deliveryAddress.zip} onChange={(event) => updateAddress('deliveryAddress', { zip: event.target.value })}/></label><label className="city"><span>Ort</span><input disabled={locked} value={draft.deliveryAddress.city} onChange={(event) => updateAddress('deliveryAddress', { city: event.target.value })}/></label></div>}</section>
      </div>

      <section className="order-card order-reference-card"><div><span className="card-kicker">Plenty-Kundenzeichen</span><h2>Bezug zum Einsatz</h2><p>Dieser Text erscheint als Kundenzeichen im Plenty-Auftrag, zum Beispiel Störung, Wartung oder Serviceeinsatz.</p></div><input disabled={locked} value={draft.customerReference} onChange={(event) => setDraft({ ...draft, customerReference: event.target.value })}/></section>

      <section className="order-card order-positions-card"><div className="order-section-heading"><div><span className="card-kicker">Auftragspositionen</span><h2>Artikel, Preise und Reihenfolge</h2><p>Klimagerät zuerst, danach Material und Service; die Anfahrt lässt sich ans Ende verschieben.</p></div>{!locked ? <button className="secondary-button" onClick={addPosition} type="button">+ Artikelposition</button> : null}</div>
        {incomplete.length ? <div className="order-warning">{incomplete.length} Position{incomplete.length === 1 ? '' : 'en'} ohne vollständigen Plenty-Artikel oder Preis. Bitte vor der Übergabe ergänzen.</div> : null}
        <div className="order-position-list">{draft.positions.map((position, index) => <article className={`order-position${!position.variationId || position.priceGross === null ? ' incomplete' : ''}`} key={position.id}><div className="order-position-sort"><span>{index + 1}</span><button aria-label="Nach oben" disabled={locked || index === 0} onClick={() => movePosition(index, -1)} type="button">↑</button><button aria-label="Nach unten" disabled={locked || index === draft.positions.length - 1} onClick={() => movePosition(index, 1)} type="button">↓</button></div><div className="order-position-main"><div className="order-position-fields"><label className="qty"><span>Menge</span><input disabled={locked} min="0.01" step="0.01" type="number" value={position.quantity} onChange={(event) => updatePosition(position.id, { quantity: Math.max(0, Number(event.target.value) || 0) })}/></label><label className="unit"><span>Einheit</span><input disabled={locked} value={position.unit} onChange={(event) => updatePosition(position.id, { unit: event.target.value })}/></label><label className="position-title"><span>Bezeichnung</span><input disabled={locked} value={position.title} onChange={(event) => updatePosition(position.id, { title: event.target.value })}/></label><label className="price"><span>Preis brutto</span><input disabled={locked} min="0" step="0.01" type="number" value={position.priceGross ?? ''} onChange={(event) => updatePosition(position.id, { priceGross: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}/></label></div>{!locked ? <ArticleSearch initialQuery={position.title} onPick={(article) => chooseArticle(position.id, article)}/> : null}<div className="order-position-meta"><span>Artikel-ID <b>{position.itemId || 'fehlt'}</b></span><span>Varianten-ID <b>{position.variationId || 'fehlt'}</b></span><span>Gesamt <b>{money(position.quantity * (position.priceGross ?? 0))}</b></span>{position.sourceType ? <span>{position.sourceType === 'route' ? 'Anfahrt' : position.sourceType === 'labor' ? 'Service' : position.sourceType === 'addition' ? 'Büro-Nachtrag' : 'Material'}</span> : null}</div></div>{!locked ? <button className="order-remove" aria-label="Position entfernen" onClick={() => setDraft({ ...draft, positions: draft.positions.filter((item) => item.id !== position.id) })} type="button">×</button> : null}</article>)}</div>
      </section>

      <div className="order-actions"><div><span>Bruttosumme</span><strong>{money(total)}</strong></div>{locked ? <a className="secondary-button order-back-link" href={`/admin/reports/${reportId}`}>Zum Arbeitsnachweis</a> : <><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void save()} type="button">{busy === 'save' ? 'Speichert …' : 'Entwurf speichern'}</button><button className="primary-button" disabled={Boolean(busy) || incomplete.length > 0 || !draft.positions.length} onClick={() => void submit()} type="button">{busy === 'submit' ? 'Wird an Plenty übergeben …' : 'Verbindlich in Plenty anlegen →'}</button></>}</div>
    </section>
  </main>;
}
