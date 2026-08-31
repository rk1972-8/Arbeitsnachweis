/**
 * Überträgt neue oder geänderte Zeilen aus der Tabelle "Leads" in die
 * veröffentlichte Mifrro-CRM-App. Diese Datei bleibt bewusst getrennt vom
 * bestehenden Gmail-/Drive-Import.
 */
const MIFRRO_CRM_SYNC_URL = 'https://mifrro-arbeitsnachweis.rk1972.chatgpt.site/api/crm/google-sync';
const MIFRRO_CRM_SYNC_SECRET_PROPERTY = 'MIFRRO_CRM_SYNC_SECRET';
const MIFRRO_CRM_SYNC_STATE_PREFIX = 'MIFRRO_CRM_SYNC_';
const MIFRRO_CRM_SYNC_CHUNK_SIZE = 25;

function syncLeadsToMifrroApp() {
  const secret = PropertiesService.getScriptProperties().getProperty(MIFRRO_CRM_SYNC_SECRET_PROPERTY);
  if (!secret) throw new Error('Script Property MIFRRO_CRM_SYNC_SECRET fehlt.');

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tabelle "' + SHEET_NAME + '" wurde nicht gefunden.');

  const range = sheet.getDataRange();
  const displayed = range.getDisplayValues();
  const raw = range.getValues();
  if (displayed.length < 2) return { changed: 0, acknowledged: 0 };

  const headers = displayed[0].map(mifrroSyncClean_);
  const properties = PropertiesService.getScriptProperties();
  const pending = [];

  for (let rowIndex = 1; rowIndex < displayed.length; rowIndex += 1) {
    const row = displayed[rowIndex];
    const sourceKey = mifrroSyncValue_(row, headers, 'ID');
    if (!sourceKey) continue;

    const payloadHash = mifrroSyncDigest_(JSON.stringify(row));
    const propertyKey = MIFRRO_CRM_SYNC_STATE_PREFIX + mifrroSyncDigest_(sourceKey).slice(0, 40);
    if (properties.getProperty(propertyKey) === payloadHash) continue;

    const lead = mifrroSyncMapLead_(row, raw[rowIndex], headers);
    lead.payload_hash = payloadHash;
    pending.push({ propertyKey: propertyKey, payloadHash: payloadHash, lead: lead });
  }

  let acknowledged = 0;
  for (let offset = 0; offset < pending.length; offset += MIFRRO_CRM_SYNC_CHUNK_SIZE) {
    const chunk = pending.slice(offset, offset + MIFRRO_CRM_SYNC_CHUNK_SIZE);
    const response = UrlFetchApp.fetch(MIFRRO_CRM_SYNC_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-CRM-Sync-Secret': secret },
      payload: JSON.stringify({ leads: chunk.map(function (item) { return item.lead; }) }),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body = response.getContentText();
    if (status < 200 || status >= 300) throw new Error('CRM-Sync fehlgeschlagen (HTTP ' + status + '): ' + body.slice(0, 500));

    const result = JSON.parse(body);
    const confirmed = {};
    (result.acknowledgements || []).forEach(function (item) {
      confirmed[String(item.source_key || '') + '|' + String(item.payload_hash || '')] = true;
    });
    const updates = {};
    chunk.forEach(function (item) {
      const key = String(item.lead.source_reference || '') + '|' + item.payloadHash;
      if (!confirmed[key]) return;
      updates[item.propertyKey] = item.payloadHash;
      acknowledged += 1;
    });
    if (Object.keys(updates).length) properties.setProperties(updates, false);
  }

  properties.setProperty('MIFRRO_CRM_SYNC_LAST_SUCCESS', new Date().toISOString());
  return { changed: pending.length, acknowledged: acknowledged };
}

function installMifrroCrmSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncLeadsToMifrroApp') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncLeadsToMifrroApp').timeBased().everyMinutes(5).create();
  return 'CRM-Synchronisierung läuft künftig alle 5 Minuten.';
}

function mifrroSyncMapLead_(row, rawRow, headers) {
  const name = mifrroSyncSplitName_(mifrroSyncValue_(row, headers, 'Name'));
  const address = mifrroSyncSplitStreet_(mifrroSyncValue_(row, headers, 'Straße'));
  const company = mifrroSyncValue_(row, headers, 'Firma');
  const phone = mifrroSyncPhone_(mifrroSyncValue_(row, headers, 'Telefon'));
  const email = mifrroSyncValue_(row, headers, 'E-Mail');
  const hasIdentity = Boolean(name.first_name || name.last_name || company || phone || email);
  const sourceKey = mifrroSyncValue_(row, headers, 'ID');
  return {
    legacy_id: sourceKey,
    source_reference: sourceKey,
    incoming_at: mifrroSyncDate_(rawRow, row, headers, 'Eingangsdatum'),
    source: mifrroSyncValue_(row, headers, 'Quelle') || 'Google-Tabelle',
    status: hasIdentity ? mifrroSyncStatus_(mifrroSyncValue_(row, headers, 'Status')) : 'Unvollständige Kontaktdaten',
    priority: mifrroSyncPriority_(mifrroSyncValue_(row, headers, 'Priorität')),
    tags: mifrroSyncValue_(row, headers, 'Tags').split(',').map(function (tag) { return tag.trim(); }).filter(Boolean),
    internal_notes: mifrroSyncValue_(row, headers, 'Notizen'),
    appointment_at: mifrroSyncDate_(rawRow, row, headers, 'Termin'),
    assignee: mifrroSyncValue_(row, headers, 'Bearbeiter'),
    first_name: name.first_name,
    last_name: name.last_name,
    company: company,
    phone: phone,
    email: email,
    street: address.street,
    house_number: address.house_number,
    zip: mifrroSyncZip_(mifrroSyncValue_(row, headers, 'PLZ')),
    city: mifrroSyncValue_(row, headers, 'Ort'),
    interest: mifrroSyncValue_(row, headers, 'Interesse'),
    manufacturer: mifrroSyncValue_(row, headers, 'Hersteller'),
    rooms: mifrroSyncValue_(row, headers, 'Räume'),
    area: mifrroSyncValue_(row, headers, 'Fläche (m²)'),
    summary: mifrroSyncValue_(row, headers, 'Zusammenfassung'),
    contact_count: Number(mifrroSyncValue_(row, headers, 'Anzahl Kontakte')) || 1,
    last_contact_at: mifrroSyncDate_(rawRow, row, headers, 'Letzter Kontakt')
  };
}

function mifrroSyncValue_(row, headers, name) {
  const index = headers.indexOf(name);
  return index < 0 ? '' : mifrroSyncClean_(row[index]);
}

function mifrroSyncClean_(value) {
  return String(value == null ? '' : value).trim();
}

function mifrroSyncDate_(rawRow, displayedRow, headers, name) {
  const index = headers.indexOf(name);
  if (index < 0) return null;
  const rawValue = rawRow[index];
  if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) return rawValue.toISOString();
  const displayedValue = mifrroSyncClean_(displayedRow[index]);
  return displayedValue || null;
}

function mifrroSyncSplitName_(value) {
  const parts = mifrroSyncClean_(value).split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || '', last_name: parts.join(' ') };
}

function mifrroSyncSplitStreet_(value) {
  const cleaned = mifrroSyncClean_(value);
  const match = cleaned.match(/^(.+?)\s+(\d+[a-zA-Z]?(?:\s*[-–/]\s*\d+[a-zA-Z]?)?)$/);
  return match ? { street: match[1].trim(), house_number: match[2].trim() } : { street: cleaned, house_number: '' };
}

function mifrroSyncPhone_(value) {
  const raw = mifrroSyncClean_(value).replace(/\.0$/, '');
  if (!raw || raw === '0') return '';
  return /^\d{7,11}$/.test(raw) && !raw.startsWith('0') && !raw.startsWith('49') ? '0' + raw : raw;
}

function mifrroSyncZip_(value) {
  const raw = mifrroSyncClean_(value).replace(/\.0$/, '');
  if (!raw || raw === '0') return '';
  return /^\d{1,5}$/.test(raw) ? raw.padStart(5, '0') : raw;
}

function mifrroSyncStatus_(value) {
  const aliases = { 'In Bearbeitung': 'Aktiv', 'Stoerung': 'Störung', 'Geloescht': 'Gelöscht' };
  const normalized = aliases[mifrroSyncClean_(value)] || mifrroSyncClean_(value);
  return ['Neu', 'Aktiv', 'Störung', 'Angebot', 'Termin', 'Auftrag', 'Erledigt', 'Absage', 'Gelöscht', 'Unvollständige Kontaktdaten'].indexOf(normalized) >= 0 ? normalized : 'Neu';
}

function mifrroSyncPriority_(value) {
  const normalized = mifrroSyncClean_(value);
  return ['Niedrig', 'Normal', 'Hoch', 'Dringend'].indexOf(normalized) >= 0 ? normalized : 'Normal';
}

function mifrroSyncDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) { const unsigned = byte < 0 ? byte + 256 : byte; return ('0' + unsigned.toString(16)).slice(-2); })
    .join('');
}
