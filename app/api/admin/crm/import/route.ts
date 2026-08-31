import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { type CrmLeadEvent, type CrmLeadInput, type CrmLeadRow, upsertCrmLead } from '../../../../../lib/crm';
import { getStaffUser } from '../../../../staff-auth';

type LegacyLead = CrmLeadInput & {
  legacy_id?: string;
  contact_count?: number;
  last_contact_at?: string;
  contact_history?: string;
  google_contact_id?: string;
  google_exported_at?: string;
  google_export_error?: string;
  plenty_contact_id?: string;
  plenty_customer_number?: string;
  plenty_address_id?: string;
  plenty_exported_at?: string;
  plenty_export_error?: string;
};

function text(value: unknown, maximum = 8_000) {
  return String(value ?? '').trim().slice(0, maximum);
}

function isoDate(value: unknown) {
  const raw = text(value, 50);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function replicaId(value: unknown) {
  const id = text(value, 250);
  return /^[A-Za-z0-9:._-]+$/.test(id) ? id : '';
}

function nullableText(value: unknown, maximum = 8_000) {
  return text(value, maximum) || null;
}

async function importReplica(
  body: { reset?: boolean; leads?: Partial<CrmLeadRow>[]; events?: Partial<CrmLeadEvent>[] },
  actor: string,
) {
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 100) : [];
  const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  const statements: D1PreparedStatement[] = [];
  if (body.reset) {
    statements.push(env.DB.prepare('DELETE FROM crm_lead_events'), env.DB.prepare('DELETE FROM crm_leads'));
  }
  for (const lead of leads) {
    const id = replicaId(lead.id);
    if (!id) continue;
    const now = new Date().toISOString();
    statements.push(env.DB.prepare(`INSERT OR REPLACE INTO crm_leads (
      id, source, source_reference, incoming_at, status, priority, tags_json, internal_notes, appointment_at, assignee,
      first_name, last_name, company, phone, phone_normalized, email, email_normalized, name_normalized,
      street, house_number, zip, city, interest, manufacturer, rooms, area, summary, contact_count, last_contact_at,
      google_contact_id, google_exported_at, google_export_error, plenty_contact_id, plenty_customer_number,
      plenty_address_id, plenty_exported_at, plenty_export_error, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, text(lead.source, 80) || 'Manuell', nullableText(lead.source_reference, 250), text(lead.incoming_at, 50) || now,
        text(lead.status, 80) || 'Neu', text(lead.priority, 40) || 'Normal', text(lead.tags_json, 2_000) || '[]',
        text(lead.internal_notes), nullableText(lead.appointment_at, 50), text(lead.assignee, 120),
        text(lead.first_name, 100), text(lead.last_name, 100), text(lead.company, 180), text(lead.phone, 80),
        text(lead.phone_normalized, 40), text(lead.email, 250), text(lead.email_normalized, 250), text(lead.name_normalized, 250),
        text(lead.street, 180), text(lead.house_number, 30), text(lead.zip, 20), text(lead.city, 120), text(lead.interest, 500),
        text(lead.manufacturer, 180), text(lead.rooms, 120), text(lead.area, 120), text(lead.summary),
        Math.max(1, Math.floor(Number(lead.contact_count) || 1)), text(lead.last_contact_at, 50) || now,
        nullableText(lead.google_contact_id, 250), nullableText(lead.google_exported_at, 50), nullableText(lead.google_export_error, 1_000),
        nullableText(lead.plenty_contact_id, 250), nullableText(lead.plenty_customer_number, 250), nullableText(lead.plenty_address_id, 250),
        nullableText(lead.plenty_exported_at, 50), nullableText(lead.plenty_export_error, 1_000), text(lead.created_by, 120) || actor,
        text(lead.created_at, 50) || now, text(lead.updated_at, 50) || now,
      ));
  }
  for (const event of events) {
    const id = replicaId(event.id);
    const leadId = replicaId(event.lead_id);
    if (!id || !leadId) continue;
    const now = new Date().toISOString();
    statements.push(env.DB.prepare(`INSERT OR REPLACE INTO crm_lead_events
      (id, lead_id, occurred_at, channel, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, leadId, text(event.occurred_at, 50) || now, text(event.channel, 80) || 'Notiz',
        text(event.note), text(event.created_by, 120) || actor, text(event.created_at, 50) || now,
      ));
  }
  if (statements.length) await env.DB.batch(statements);
  return { reset: Boolean(body.reset), leads: leads.length, events: events.length };
}

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  try {
    const body = await request.json() as {
      mode?: string;
      reset?: boolean;
      leads?: Array<LegacyLead & Partial<CrmLeadRow>>;
      events?: Partial<CrmLeadEvent>[];
    };
    if (body.mode === 'replica') {
      if (request.headers.get('x-crm-replica-confirm') !== 'replace-full-crm') {
        return NextResponse.json({ error: 'CRM-Replikation wurde nicht bestätigt.' }, { status: 403 });
      }
      return NextResponse.json(await importReplica(body, user.displayName));
    }
    const leads = Array.isArray(body.leads) ? body.leads.slice(0, 500) : [];
    if (!leads.length) return NextResponse.json({ error: 'Keine Leads zum Importieren erhalten.' }, { status: 422 });
    const result = { total: leads.length, created: 0, merged: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (let index = 0; index < leads.length; index += 1) {
      const lead = leads[index];
      const legacyId = text(lead.legacy_id || lead.source_reference || `row-${index + 2}`, 230);
      const markerId = `legacy:${legacyId}`;
      try {
        const existingMarker = await env.DB.prepare('SELECT lead_id FROM crm_lead_events WHERE id = ?').bind(markerId).first<{ lead_id: string }>();
        if (existingMarker) { result.skipped += 1; continue; }
        const imported = await upsertCrmLead(
          env.DB,
          { ...lead, source_reference: legacyId },
          user.displayName,
          { allowIncomplete: true },
        );
        if (imported.merged) result.merged += 1;
        else result.created += 1;

        const now = new Date().toISOString();
        const lastContactAt = isoDate(lead.last_contact_at) ?? isoDate(lead.incoming_at) ?? now;
        const contactCount = Math.max(1, Math.floor(Number(lead.contact_count) || 1));
        await env.DB.batch([
          env.DB.prepare(`UPDATE crm_leads SET
            contact_count = MAX(contact_count, ?), last_contact_at = MAX(last_contact_at, ?),
            google_contact_id = COALESCE(NULLIF(?, ''), google_contact_id),
            google_exported_at = COALESCE(?, google_exported_at), google_export_error = COALESCE(NULLIF(?, ''), google_export_error),
            plenty_contact_id = COALESCE(NULLIF(?, ''), plenty_contact_id), plenty_customer_number = COALESCE(NULLIF(?, ''), plenty_customer_number),
            plenty_address_id = COALESCE(NULLIF(?, ''), plenty_address_id),
            plenty_exported_at = COALESCE(?, plenty_exported_at), plenty_export_error = COALESCE(NULLIF(?, ''), plenty_export_error),
            updated_at = ? WHERE id = ?`)
            .bind(
              contactCount, lastContactAt, text(lead.google_contact_id, 250), isoDate(lead.google_exported_at), text(lead.google_export_error, 1_000),
              text(lead.plenty_contact_id, 250), text(lead.plenty_customer_number, 250), text(lead.plenty_address_id, 250),
              isoDate(lead.plenty_exported_at), text(lead.plenty_export_error, 1_000),
              now, imported.lead.id,
            ),
          env.DB.prepare(`INSERT OR IGNORE INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(markerId, imported.lead.id, lastContactAt, 'Import', text(lead.contact_history) || `Aus Google-Tabelle importiert (${legacyId}).`, user.displayName, now),
        ]);
      } catch (error) {
        result.failed += 1;
        if (result.errors.length < 12) result.errors.push(`Zeile ${index + 2}: ${error instanceof Error ? error.message : 'Import fehlgeschlagen.'}`);
      }
    }
    return NextResponse.json(result, { status: result.failed === result.total ? 422 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import fehlgeschlagen.' }, { status: 422 });
  }
}
