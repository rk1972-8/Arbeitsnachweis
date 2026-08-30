import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../../../db/ensure';
import { CRM_CHANNELS } from '../../../../../../../lib/crm';
import { getStaffUser } from '../../../../../../staff-auth';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  try {
    const body = await request.json() as { channel?: string; note?: string; occurredAt?: string };
    const note = String(body.note ?? '').trim().slice(0, 8_000);
    if (!note) return NextResponse.json({ error: 'Bitte eine Notiz eingeben.' }, { status: 422 });
    const channel = CRM_CHANNELS.includes(body.channel as (typeof CRM_CHANNELS)[number]) ? String(body.channel) : 'Notiz';
    const parsed = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const occurredAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE crm_leads SET contact_count = contact_count + 1, last_contact_at = ?, updated_at = ? WHERE id = ?`)
        .bind(occurredAt, now, id),
      env.DB.prepare(`INSERT INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
        SELECT ?, id, ?, ?, ?, ?, ? FROM crm_leads WHERE id = ?`)
        .bind(eventId, occurredAt, channel, note, user.displayName, now, id),
    ]);
    if (!result[0].meta.changes) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
    return NextResponse.json({ event: { id: eventId, lead_id: id, occurred_at: occurredAt, channel, note, created_by: user.displayName, created_at: now } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kontakt konnte nicht gespeichert werden.' }, { status: 422 });
  }
}
