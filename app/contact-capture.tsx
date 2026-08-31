'use client';

import { useRef, useState } from 'react';
import type { CrmContactExtraction } from '../lib/crm-contact-extraction';

type RecognitionResultEvent = { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type RecognitionErrorEvent = { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

async function preparePhoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Bitte ein Foto auswählen.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Das Foto ist zu groß. Bitte höchstens 15 MB verwenden.');
  const image = document.createElement('img');
  const source = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Das Foto konnte nicht gelesen werden.'));
      image.src = source;
    });
    const maximum = 1_800;
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Das Foto konnte nicht vorbereitet werden.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .84);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function ContactCapture({ endpoint, onExtract, description = 'Die erkannten Angaben werden nur in die Felder übernommen. Vor dem Speichern kannst du alles kontrollieren.', dictationPlaceholder = 'Zum Beispiel: Firma Maier, Ansprechpartner Herr Thomas Maier, Telefon …, Adresse …' }: {
  endpoint: string;
  onExtract: (result: CrmContactExtraction) => void;
  description?: string;
  dictationPlaceholder?: string;
}) {
  const [mode, setMode] = useState<'dictation' | 'text' | 'photo'>('dictation');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  function toggleDictation() {
    if (listening) { recognition.current?.stop(); return; }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setError('Die direkte Spracherkennung wird hier nicht unterstützt. Du kannst das Mikrofon der iPhone-Tastatur im Textfeld verwenden.');
      return;
    }
    setError('');
    const instance = new Constructor();
    instance.lang = 'de-DE';
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      let addition = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) addition += `${event.results[index][0].transcript} `;
      }
      if (addition) setText((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${addition}`.trimStart());
    };
    instance.onend = () => setListening(false);
    instance.onerror = (event) => { setListening(false); if (event.error !== 'aborted') setError('Das Diktat wurde unterbrochen. Bitte erneut versuchen oder die Tastatur-Diktierfunktion verwenden.'); };
    recognition.current = instance;
    instance.start(); setListening(true);
  }

  async function selectPhoto(file?: File) {
    if (!file) return;
    setError('');
    try { setPhoto(await preparePhoto(file)); setPhotoName(file.name); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Das Foto konnte nicht vorbereitet werden.'); }
  }

  async function analyze() {
    if (!text.trim() && !photo) { setError('Bitte zuerst diktieren, Text einfügen oder ein Foto aufnehmen.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, imageDataUrl: photo, mode }) });
      const payload = await response.json() as { result?: CrmContactExtraction; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || 'Kundendaten konnten nicht ausgewertet werden.');
      onExtract(payload.result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Kundendaten konnten nicht ausgewertet werden.'); }
    finally { setBusy(false); }
  }

  return <section className="crm-capture-card">
    <div className="crm-capture-head"><div><span className="card-kicker">Schnellerfassung</span><h3>Diktieren, Text einfügen oder fotografieren</h3><p>{description}</p></div><span className="ai-badge">KI-Auswertung</span></div>
    <div className="crm-capture-tabs"><button className={mode === 'dictation' ? 'active' : ''} onClick={() => setMode('dictation')} type="button">🎙 Diktat</button><button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')} type="button">Textblock</button><button className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')} type="button">📷 Foto</button></div>
    {mode === 'photo' ? <div className="crm-photo-input"><label><input accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void selectPhoto(event.target.files?.[0])} type="file" /><span>{photo ? 'Anderes Foto aufnehmen' : 'Geschäftspapier fotografieren'}</span></label>{photo ? <div className="crm-photo-preview"><img alt="Ausgewähltes Geschäftspapier" src={photo} /><div><strong>{photoName || 'Foto'}</strong><button onClick={() => { setPhoto(''); setPhotoName(''); }} type="button">Entfernen</button></div></div> : <p>Zum Beispiel Briefkopf, Visitenkarte, Rechnung oder handschriftliche Kundendaten.</p>}</div> : <div className="crm-capture-text"><textarea onChange={(event) => setText(event.target.value)} placeholder={mode === 'dictation' ? dictationPlaceholder : 'E-Mail, Gesprächsnotiz oder kompletten Kontaktdatenblock hier einfügen …'} value={text} />{mode === 'dictation' ? <button className={listening ? 'listening' : ''} onClick={toggleDictation} type="button">{listening ? '■ Diktat beenden' : '● Diktat starten'}</button> : null}</div>}
    {error ? <div className="alert error-alert">{error}</div> : null}
    <button className="primary-button crm-analyze-contact" disabled={busy} onClick={() => void analyze()} type="button">{busy ? 'Foto und Angaben werden ausgewertet …' : 'Auswerten und Felder füllen'}</button>
  </section>;
}
