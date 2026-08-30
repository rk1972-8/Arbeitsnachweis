export const CRM_STATUSES = [
  'Neu',
  'Aktiv',
  'Störung',
  'Angebot',
  'Termin',
  'Auftrag',
  'Erledigt',
  'Absage',
  'Unvollständige Kontaktdaten',
  'Gelöscht',
] as const;

export const CRM_PRIORITIES = ['Niedrig', 'Normal', 'Hoch', 'Dringend'] as const;
export const CRM_CHANNELS = ['Telefon', 'E-Mail', 'Website', 'Fonio', 'WhatsApp', 'Notiz'] as const;

export type CrmLead = {
  id: string;
  source: string;
  source_reference: string | null;
  incoming_at: string;
  status: string;
  priority: string;
  tags: string[];
  internal_notes: string;
  appointment_at: string | null;
  assignee: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  email: string;
  street: string;
  house_number: string;
  zip: string;
  city: string;
  interest: string;
  manufacturer: string;
  rooms: string;
  area: string;
  summary: string;
  contact_count: number;
  last_contact_at: string;
  google_contact_id: string | null;
  google_exported_at: string | null;
  google_export_error: string | null;
  plenty_contact_id: string | null;
  plenty_address_id: string | null;
  plenty_exported_at: string | null;
  plenty_export_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CrmLeadEvent = {
  id: string;
  lead_id: string;
  occurred_at: string;
  channel: string;
  note: string;
  created_by: string;
  created_at: string;
};

export type CrmLeadInput = Partial<Omit<CrmLead, 'id' | 'tags' | 'contact_count' | 'created_at' | 'updated_at'>> & {
  tags?: string[] | string;
};

export type CrmLeadRow = Omit<CrmLead, 'tags'> & {
  tags_json: string;
  phone_normalized: string;
  email_normalized: string;
  name_normalized: string;
};

function cleaned(value: unknown, maxLength = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function optionalDate(value: unknown) {
  const normalized = cleaned(value, 40);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `49${digits.slice(1)}`;
  return digits.slice(0, 24);
}

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase('de').slice(0, 250);
}

export function normalizeLeadName(firstName: string, lastName: string, company: string) {
  const name = `${firstName} ${lastName}`.trim() || company.trim();
  return name
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 250);
}

export function whatsappUrl(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized ? `https://wa.me/${normalized}` : '';
}

export function parseCrmTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => { try { return JSON.parse(value) as unknown; } catch { return value.split(','); } })()
      : [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((tag) => cleaned(tag, 40)).filter(Boolean))].slice(0, 20);
}

export function mapCrmLead(row: CrmLeadRow): CrmLead {
  const { tags_json, phone_normalized: _phone, email_normalized: _email, name_normalized: _name, ...lead } = row;
  void _phone;
  void _email;
  void _name;
  return { ...lead, tags: parseCrmTags(tags_json) };
}

function normalizedInput(input: CrmLeadInput) {
  const firstName = cleaned(input.first_name, 100);
  const lastName = cleaned(input.last_name, 100);
  const company = cleaned(input.company, 180);
  const phone = cleaned(input.phone, 80);
  const email = cleaned(input.email, 250);
  const incomingAt = optionalDate(input.incoming_at) ?? new Date().toISOString();
  const status = CRM_STATUSES.includes(input.status as (typeof CRM_STATUSES)[number]) ? String(input.status) : 'Neu';
  const priority = CRM_PRIORITIES.includes(input.priority as (typeof CRM_PRIORITIES)[number]) ? String(input.priority) : 'Normal';
  return {
    source: cleaned(input.source, 80) || 'Manuell',
    sourceReference: cleaned(input.source_reference, 250) || null,
    incomingAt,
    status,
    priority,
    tags: parseCrmTags(input.tags),
    internalNotes: cleaned(input.internal_notes, 8_000),
    appointmentAt: optionalDate(input.appointment_at),
    assignee: cleaned(input.assignee, 120),
    firstName,
    lastName,
    company,
    phone,
    phoneNormalized: normalizePhone(phone),
    email,
    emailNormalized: normalizeEmail(email),
    nameNormalized: normalizeLeadName(firstName, lastName, company),
    street: cleaned(input.street, 180),
    houseNumber: cleaned(input.house_number, 30),
    zip: cleaned(input.zip, 20),
    city: cleaned(input.city, 120),
    interest: cleaned(input.interest, 500),
    manufacturer: cleaned(input.manufacturer, 180),
    rooms: cleaned(input.rooms, 120),
    area: cleaned(input.area, 120),
    summary: cleaned(input.summary, 8_000),
  };
}

async function findDuplicate(db: D1Database, input: ReturnType<typeof normalizedInput>) {
  const checks: Array<[string, string]> = [
    ['phone_normalized', input.phoneNormalized],
    ['email_normalized', input.emailNormalized],
    ['name_normalized', input.nameNormalized],
  ];
  for (const [column, value] of checks) {
    if (!value) continue;
    const row = await db.prepare(`SELECT * FROM crm_leads WHERE ${column} = ? ORDER BY last_contact_at DESC LIMIT 1`)
      .bind(value)
      .first<CrmLeadRow>();
    if (row) return row;
  }
  return null;
}

function fillEmpty(existing: string, incoming: string) {
  return existing.trim() ? existing : incoming;
}

export async function upsertCrmLead(db: D1Database, input: CrmLeadInput, actor: string) {
  const normalized = normalizedInput(input);
  if (!normalized.company && !normalized.firstName && !normalized.lastName && !normalized.phone && !normalized.email) {
    throw new Error('Bitte mindestens Name, Firma, Telefonnummer oder E-Mail-Adresse angeben.');
  }

  const existing = await findDuplicate(db, normalized);
  const now = new Date().toISOString();
  if (existing) {
    const tags = [...new Set([...parseCrmTags(existing.tags_json), ...normalized.tags])];
    const eventNote = normalized.summary
      ? `Weitere Anfrage über ${normalized.source}: ${normalized.summary}`
      : `Erneuter Kontakt über ${normalized.source}.`;
    await db.batch([
      db.prepare(`UPDATE crm_leads SET
        source = ?, source_reference = COALESCE(source_reference, ?), status = CASE WHEN status = 'Gelöscht' THEN ? ELSE status END,
        tags_json = ?, internal_notes = CASE WHEN internal_notes = '' THEN ? ELSE internal_notes END,
        appointment_at = COALESCE(appointment_at, ?), assignee = CASE WHEN assignee = '' THEN ? ELSE assignee END,
        first_name = ?, last_name = ?, company = ?, phone = ?, phone_normalized = ?, email = ?, email_normalized = ?, name_normalized = ?,
        street = ?, house_number = ?, zip = ?, city = ?, interest = ?, manufacturer = ?, rooms = ?, area = ?,
        contact_count = contact_count + 1, last_contact_at = ?, updated_at = ?
        WHERE id = ?`)
        .bind(
          normalized.source, normalized.sourceReference, normalized.status, JSON.stringify(tags), normalized.internalNotes,
          normalized.appointmentAt, normalized.assignee,
          fillEmpty(existing.first_name, normalized.firstName), fillEmpty(existing.last_name, normalized.lastName),
          fillEmpty(existing.company, normalized.company), fillEmpty(existing.phone, normalized.phone),
          existing.phone_normalized || normalized.phoneNormalized, fillEmpty(existing.email, normalized.email),
          existing.email_normalized || normalized.emailNormalized, existing.name_normalized || normalized.nameNormalized,
          fillEmpty(existing.street, normalized.street), fillEmpty(existing.house_number, normalized.houseNumber),
          fillEmpty(existing.zip, normalized.zip), fillEmpty(existing.city, normalized.city),
          fillEmpty(existing.interest, normalized.interest), fillEmpty(existing.manufacturer, normalized.manufacturer),
          fillEmpty(existing.rooms, normalized.rooms), fillEmpty(existing.area, normalized.area),
          normalized.incomingAt, now, existing.id,
        ),
      db.prepare(`INSERT INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), existing.id, normalized.incomingAt, normalized.source, eventNote, actor, now),
    ]);
    const updated = await db.prepare('SELECT * FROM crm_leads WHERE id = ?').bind(existing.id).first<CrmLeadRow>();
    if (!updated) throw new Error('Der vorhandene Lead konnte nicht aktualisiert werden.');
    return { lead: mapCrmLead(updated), merged: true };
  }

  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO crm_leads (
      id, source, source_reference, incoming_at, status, priority, tags_json, internal_notes, appointment_at, assignee,
      first_name, last_name, company, phone, phone_normalized, email, email_normalized, name_normalized,
      street, house_number, zip, city, interest, manufacturer, rooms, area, summary,
      contact_count, last_contact_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(
        id, normalized.source, normalized.sourceReference, normalized.incomingAt, normalized.status, normalized.priority,
        JSON.stringify(normalized.tags), normalized.internalNotes, normalized.appointmentAt, normalized.assignee,
        normalized.firstName, normalized.lastName, normalized.company, normalized.phone, normalized.phoneNormalized,
        normalized.email, normalized.emailNormalized, normalized.nameNormalized, normalized.street, normalized.houseNumber,
        normalized.zip, normalized.city, normalized.interest, normalized.manufacturer, normalized.rooms, normalized.area,
        normalized.summary, normalized.incomingAt, actor, now, now,
      ),
    db.prepare(`INSERT INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, normalized.incomingAt, normalized.source, normalized.summary || 'Lead angelegt.', actor, now),
  ]);
  const created = await db.prepare('SELECT * FROM crm_leads WHERE id = ?').bind(id).first<CrmLeadRow>();
  if (!created) throw new Error('Der Lead konnte nicht angelegt werden.');
  return { lead: mapCrmLead(created), merged: false };
}

export function editableCrmLead(input: CrmLeadInput) {
  return normalizedInput(input);
}
