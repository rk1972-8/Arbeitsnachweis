import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { type CrmLeadInput, upsertCrmLead } from '../../../../../lib/crm';
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

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  try {
    const body = await request.json() as { leads?: LegacyLead[] };
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
