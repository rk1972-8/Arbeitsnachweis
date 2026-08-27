'use client';

import { useEffect, useState } from 'react';
import type { ArticleMatch } from '../lib/types';

export function ArticleSearch({ initialQuery, onPick }: { initialQuery: string; onPick: (article: ArticleMatch) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [articles, setArticles] = useState<ArticleMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
    setArticles([]);
    setSearched(false);
  }, [initialQuery]);

  async function search() {
    if (query.trim().length < 2) {
      setError('Bitte mindestens 2 Zeichen eingeben.');
      return;
    }
    setBusy(true); setError(''); setSearched(false);
    try {
      const response = await fetch(`/api/articles?q=${encodeURIComponent(query.trim())}`);
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
      {error ? <small className="article-error">{error}</small> : null}
      {searched && !articles.length ? <small className="article-empty">Keine passenden Plenty-Artikel gefunden. Suchbegriff bitte verkürzen.</small> : null}
      {articles.length ? <div className="article-results">{articles.map((article) => <button key={article.variationId} onClick={() => { onPick(article); setQuery(article.title || article.variationName || query); setArticles([]); setSearched(false); }} type="button"><strong>{article.title || 'Kein Artikeltitel hinterlegt'}</strong><span className="article-result-ids"><span>Artikel-ID <b>{article.itemId}</b></span><span>Varianten-ID <b>{article.variationId}</b></span>{article.priceGross !== undefined ? <span>Preis <b>{article.priceGross.toLocaleString('de-DE', { style: 'currency', currency: article.currency || 'EUR' })}</b></span> : null}</span><small><b>Variante:</b> {article.variationName || '–'}</small><small><b>Modell:</b> {article.model || '–'}</small></button>)}</div> : null}
    </div>
  );
}
