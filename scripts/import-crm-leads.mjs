import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

function serialDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return new Date(Math.round((value - 25_569) * 86_400_000)).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function value(row, headers, name) {
  const index = headers.indexOf(name);
  return index < 0 ? '' : row[index] ?? '';
}

function clean(value) {
  return String(value ?? '').trim();
}

function splitName(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() ?? '', last_name: parts.join(' ') };
}

function splitStreet(address) {
  const cleaned = clean(address);
  const match = cleaned.match(/^(.+?)\s+(\d+[a-zA-Z]?(?:\s*[-–/]\s*\d+[a-zA-Z]?)?)$/);
  return match ? { street: match[1].trim(), house_number: match[2].trim() } : { street: cleaned, house_number: '' };
}

function phone(value) {
  const raw = clean(value).replace(/\.0$/, '');
  if (!raw || raw === '0') return '';
  return /^\d{7,11}$/.test(raw) && !raw.startsWith('0') && !raw.startsWith('49') ? `0${raw}` : raw;
}

function zip(value) {
  const raw = clean(value).replace(/\.0$/, '');
  if (!raw || raw === '0') return '';
  return /^\d{1,5}$/.test(raw) ? raw.padStart(5, '0') : raw;
}

function status(value) {
  const raw = clean(value);
  const aliases = { 'In Bearbeitung': 'Aktiv', Stoerung: 'Störung', Geloescht: 'Gelöscht' };
  const mapped = aliases[raw] ?? raw;
  return ['Neu', 'Aktiv', 'Störung', 'Angebot', 'Termin', 'Auftrag', 'Erledigt', 'Absage', 'Gelöscht', 'Unvollständige Kontaktdaten'].includes(mapped) ? mapped : 'Neu';
}

function priority(value) {
  const raw = clean(value);
  const aliases = { Hoch: 'Hoch', Dringend: 'Dringend', Niedrig: 'Niedrig' };
  return aliases[raw] ?? 'Normal';
}

function mapRows(payload) {
  const headers = payload.headers.map(clean);
  return payload.rows.map((row) => {
    const legacyId = clean(value(row, headers, 'ID'));
    const name = splitName(value(row, headers, 'Name'));
    const address = splitStreet(value(row, headers, 'Straße'));
    const company = clean(value(row, headers, 'Firma'));
    const mappedPhone = phone(value(row, headers, 'Telefon'));
    const email = clean(value(row, headers, 'E-Mail'));
    const hasContactIdentity = Boolean(name.first_name || name.last_name || company || mappedPhone || email);
    return {
      legacy_id: legacyId,
      source_reference: legacyId,
      incoming_at: serialDate(value(row, headers, 'Eingangsdatum')),
      source: clean(value(row, headers, 'Quelle')) || 'Google-Tabelle',
      status: hasContactIdentity ? status(value(row, headers, 'Status')) : 'Unvollständige Kontaktdaten',
      priority: priority(value(row, headers, 'Priorität')),
      tags: clean(value(row, headers, 'Tags')).split(',').map((item) => item.trim()).filter(Boolean),
      internal_notes: clean(value(row, headers, 'Notizen')),
      appointment_at: serialDate(value(row, headers, 'Termin')),
      assignee: clean(value(row, headers, 'Bearbeiter')),
      ...name,
      company,
      phone: mappedPhone,
      email,
      ...address,
      zip: zip(value(row, headers, 'PLZ')),
      city: clean(value(row, headers, 'Ort')),
      interest: clean(value(row, headers, 'Interesse')),
      manufacturer: clean(value(row, headers, 'Hersteller')),
      rooms: clean(value(row, headers, 'Räume')),
      area: clean(value(row, headers, 'Fläche (m²)')),
      summary: clean(value(row, headers, 'Zusammenfassung')),
      contact_count: Number(value(row, headers, 'Anzahl Kontakte')) || 1,
      last_contact_at: serialDate(value(row, headers, 'Letzter Kontakt')),
      contact_history: clean(value(row, headers, 'Kontaktverlauf')),
      google_exported_at: serialDate(value(row, headers, 'Kontakt exportiert am')),
      google_contact_id: clean(value(row, headers, 'Google Kontakt-ID')),
      google_export_error: clean(value(row, headers, 'Kontakt Export Fehler')),
      plenty_exported_at: serialDate(value(row, headers, 'Plenty exportiert am')),
      plenty_contact_id: clean(value(row, headers, 'Plenty Kontakt-ID')),
      plenty_address_id: clean(value(row, headers, 'Plenty Adresse-ID')),
      plenty_export_error: clean(value(row, headers, 'Plenty Export Fehler')),
    };
  });
}

const baseUrl = process.argv[2] || 'http://localhost:3000';
const cookieFile = process.argv[3];
const inputFile = process.argv[4];
if (!cookieFile) throw new Error('Cookie-Datei fehlt.');
const cookieText = await readFile(cookieFile, 'utf8');
const cookieLine = cookieText.split(/\r?\n/).find((line) => line.includes('\tmifrro_session\t'));
const token = cookieLine?.split('\t').at(-1)?.trim();
if (!token) throw new Error('Admin-Sitzung fehlt.');

async function importPayload(payload) {
  const leads = mapRows(payload);
  const response = await fetch(`${baseUrl}/api/admin/crm/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `mifrro_session=${token}` },
    body: JSON.stringify({ leads }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || JSON.stringify(result));
  console.log(JSON.stringify(result));
}

if (inputFile) {
  await importPayload(JSON.parse(await readFile(inputFile, 'utf8')));
} else {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    await importPayload(JSON.parse(line));
    break;
  }
}
