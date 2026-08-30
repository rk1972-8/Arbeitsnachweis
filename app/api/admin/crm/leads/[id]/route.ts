import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../../db/ensure';
import { editableCrmLead, mapCrmLead, type CrmLeadInput, type CrmLeadRow } from '../../../../../../lib/crm';
import { getStaffUser } from '../../../../../staff-auth';

async function requireAdmin() {
  const user = await getStaffUser();
  return user?.role === 'admin' ? user : null;
}

async function readLead(id: string) {
  return env.DB.prepare('SELECT * FROM crm_leads WHERE id = ?').bind(id).first<CrmLeadRow>();
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const lead = await readLead(id);
  if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
  const events = await env.DB.prepare('SELECT * FROM crm_lead_events WHERE lead_id = ? ORDER BY occurred_at DESC, created_at DESC')
    .bind(id).all();
  return NextResponse.json({ lead: mapCrmLead(lead), events: events.results ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const existing = await readLead(id);
  if (!existing) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
  try {
    const patch = await request.json() as CrmLeadInput;
    const current = mapCrmLead(existing);
    const normalized = editableCrmLead({ ...current, ...patch, tags: patch.tags ?? current.tags });
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE crm_leads SET
      source = ?, source_reference = ?, incoming_at = ?, status = ?, priority = ?, tags_json = ?, internal_notes = ?,
      appointment_at = ?, assignee = ?, first_name = ?, last_name = ?, company = ?, phone = ?, phone_normalized = ?,
      email = ?, email_normalized = ?, name_normalized = ?, street = ?, house_number = ?, zip = ?, city = ?, interest = ?,
      manufacturer = ?, rooms = ?, area = ?, summary = ?, updated_at = ? WHERE id = ?`)
      .bind(
        normalized.source, normalized.sourceReference, normalized.incomingAt, normalized.status, normalized.priority,
        JSON.stringify(normalized.tags), normalized.internalNotes, normalized.appointmentAt, normalized.assignee,
        normalized.firstName, normalized.lastName, normalized.company, normalized.phone, normalized.phoneNormalized,
        normalized.email, normalized.emailNormalized, normalized.nameNormalized, normalized.street, normalized.houseNumber,
        normalized.zip, normalized.city, normalized.interest, normalized.manufacturer, normalized.rooms, normalized.area,
        normalized.summary, now, id,
      ).run();
    const updated = await readLead(id);
    return NextResponse.json({ lead: updated ? mapCrmLead(updated) : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lead konnte nicht aktualisiert werden.' }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const result = await env.DB.prepare("UPDATE crm_leads SET status = 'Gelöscht', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id).run();
  if (!result.meta.changes) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
