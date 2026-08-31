'use client';

import { useEffect, useState } from 'react';
import type { ArticleManufacturer, ArticleMatch } from '../lib/types';

export function ArticleSearch({ initialQuery, onPick }: { initialQuery: string; onPick: (article: ArticleMatch) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [articles, setArticles] = useState<ArticleMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [manufacturer, setManufacturer] = useState('');
  const [manufacturers, setManufacturers] = useState<ArticleManufacturer[]>([]);

  useEffect(() => {
    setQuery(initialQuery);
    setArticles([]);
    setSearched(false);
  }, [initialQuery]);

  async function loadManufacturers() {
    if (manufacturers.length) return;
    try {
      const response = await fetch('/api/articles?facets=1');
      const payload = await response.json() as { manufacturers?: ArticleManufacturer[] };
      if (response.ok) setManufacturers(payload.manufacturers ?? []);
    } catch { /* Die normale Suche bleibt auch ohne Herstellerliste nutzbar. */ }
  }

  async function search() {
    if (query.trim().length < 2 && !manufacturer && status === 'active') {
      setError('Bitte mindestens 2 Zeichen eingeben.');
      return;
    }
    setBusy(true); setError(''); setSearched(false);
    try {
      const parameters = new URLSearchParams({ q: query.trim(), status });
      if (manufacturer) parameters.set('manufacturer', manufacturer);
      const response = await fetch(`/api/articles?${parameters}`);
      const payload = await response.json() as { articles?: ArticleMatch[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Artikelsuche fehlgeschlagen.');
      setArticles(payload.articles ?? []);
      setSearched(true);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Artikelsuche fehlgeschlagen.');
    } finally { setBusy(false); }
  }

  return (
    <div className="article-search-box">
      <div className="article-search-row">
        <input aria-label="In Plenty suchen" onChange={(event) => { setQuery(event.target.value); setArticles([]); setSearched(false); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} placeholder="In Plenty suchen …" value={query}/>
        <button disabled={busy} onClick={search} type="button">{busy ? 'Suche …' : 'Plenty suchen'}</button>
      </div>
      <button className="article-advanced-toggle" onClick={() => { setAdvanced((current) => !current); if (!advanced) void loadManufacturers(); }} type="button">{advanced ? 'Erweiterte Suche schließen' : 'Erweiterte Suche'}</button>
      {advanced ? <div className="article-advanced-panel"><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'inactive' | 'all')}><option value="active">Nur aktive Artikel</option><option value="inactive">Nur inaktive Artikel</option><option value="all">Aktive und inaktive</option></select></label><label><span>Hersteller</span><select value={manufacturer} onChange={(event) => setManufacturer(event.target.value)}><option value="">Alle Hersteller</option>{manufacturers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div> : null}
      {error ? <small className="article-error">{error}</small> : null}
      {searched && !articles.length ? <small className="article-empty">Keine passenden Plenty-Artikel gefunden. Suchbegriff bitte verkürzen.</small> : null}
      {articles.length ? <div className={`article-results${advanced ? ' with-advanced' : ''}`}>{articles.map((article) => <button key={article.variationId} onClick={() => { onPick(article); setQuery(article.title || article.variationName || query); setArticles([]); setSearched(false); }} type="button"><strong>{article.title || 'Kein Artikeltitel hinterlegt'}</strong><span className="article-result-ids"><span>Artikel-ID <b>{article.itemId}</b></span><span>Varianten-ID <b>{article.variationId}</b></span><span>Status <b>{article.isActive ? 'Aktiv' : 'Inaktiv'}</b></span>{article.priceGross !== undefined ? <span>Preis <b>{article.priceGross.toLocaleString('de-DE', { style: 'currency', currency: article.currency || 'EUR' })}</b></span> : null}</span><small><b>Variante:</b> {article.variationName || '–'}</small><small><b>Modell:</b> {article.model || '–'}</small>{article.manufacturer ? <small><b>Hersteller:</b> {article.manufacturer}</small> : null}</button>)}</div> : null}
    </div>
  );
}
