import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../db/ensure';
import { type CrmLeadInput, type CrmLeadRow, upsertCrmLead } from '../../../../lib/crm';

type GoogleLead = CrmLeadInput & {
  legacy_id?: string;
  payload_hash?: string;
  contact_count?: number;
  last_contact_at?: string;
};

function text(value: unknown, maximum = 8_000) {
  return String(value ?? '').trim().slice(0, maximum);
}

function safeKey(value: unknown) {
  const key = text(value, 250);
  return /^[A-Za-z0-9:._| -]+$/.test(key) ? key : '';
}

function runtimeSecret() {
  return String((env as typeof env & { CRM_SYNC_SECRET?: string }).CRM_SYNC_SECRET ?? '').trim();
}

function secretMatches(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

async function writeSyncState(values: {
  startedAt: string;
  succeededAt?: string | null;
  error?: string;
  received?: number;
  created?: number;
  merged?: number;
  initialized?: number;
  skipped?: number;
}) {
  await env.DB.prepare(`INSERT INTO crm_sync_state
    (id, last_started_at, last_succeeded_at, last_error, received, created, merged, initialized, skipped)
    VALUES ('google', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_started_at = excluded.last_started_at,
      last_succeeded_at = COALESCE(excluded.last_succeeded_at, crm_sync_state.last_succeeded_at),
      last_error = excluded.last_error,
      received = excluded.received,
      created = excluded.created,
      merged = excluded.merged,
      initialized = excluded.initialized,
      skipped = excluded.skipped`)
    .bind(
      values.startedAt,
      values.succeededAt ?? null,
      text(values.error, 1_000),
      values.received ?? 0,
      values.created ?? 0,
      values.merged ?? 0,
      values.initialized ?? 0,
      values.skipped ?? 0,
    ).run();
}

export async function POST(request: Request) {
  const expected = runtimeSecret();
  const receivedSecret = request.headers.get('x-crm-sync-secret')?.trim() ?? '';
  if (!expected) return NextResponse.json({ error: 'CRM-Synchronisierung ist noch nicht eingerichtet.' }, { status: 503 });
  if (!secretMatches(expected, receivedSecret)) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  await ensureDatabase();
  const startedAt = new Date().toISOString();
  try {
    const body = await request.json() as { leads?: GoogleLead[] };
    const leads = Array.isArray(body.leads) ? body.leads.slice(0, 100) : [];
    if (!leads.length) return NextResponse.json({ error: 'Keine Leads erhalten.' }, { status: 422 });
    const result = { received: leads.length, created: 0, merged: 0, initialized: 0, skipped: 0, acknowledgements: [] as Array<{ source_key: string; payload_hash: string }> };

    for (const lead of leads) {
      const sourceKey = safeKey(lead.legacy_id || lead.source_reference);
      const payloadHash = text(lead.payload_hash, 120);
      if (!sourceKey || !payloadHash) continue;

      const synced = await env.DB.prepare('SELECT payload_hash, lead_id FROM crm_sync_items WHERE source_key = ?')
        .bind(sourceKey).first<{ payload_hash: string; lead_id: string }>();
      if (synced?.payload_hash === payloadHash) {
        result.skipped += 1;
        result.acknowledgements.push({ source_key: sourceKey, payload_hash: payloadHash });
        continue;
      }

      const existingReplica = !synced
        ? await env.DB.prepare('SELECT * FROM crm_leads WHERE source_reference = ? LIMIT 1').bind(sourceKey).first<CrmLeadRow>()
        : null;
      if (existingReplica) {
        await env.DB.prepare(`INSERT INTO crm_sync_items (source_key, payload_hash, lead_id, synced_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET payload_hash = excluded.payload_hash,
          lead_id = excluded.lead_id, synced_at = excluded.synced_at`)
          .bind(sourceKey, payloadHash, existingReplica.id, startedAt).run();
        result.initialized += 1;
        result.acknowledgements.push({ source_key: sourceKey, payload_hash: payloadHash });
        continue;
      }

      const imported = await upsertCrmLead(env.DB, { ...lead, source_reference: sourceKey }, 'Google-Automatik', { allowIncomplete: true });
      const incomingCount = Math.max(1, Math.floor(Number(lead.contact_count) || 1));
      const lastContactAt = text(lead.last_contact_at || lead.incoming_at, 50) || startedAt;
      await env.DB.batch([
        env.DB.prepare(`UPDATE crm_leads SET contact_count = MAX(contact_count, ?),
          last_contact_at = MAX(last_contact_at, ?), updated_at = ? WHERE id = ?`)
          .bind(incomingCount, lastContactAt, startedAt, imported.lead.id),
        env.DB.prepare(`INSERT INTO crm_sync_items (source_key, payload_hash, lead_id, synced_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET payload_hash = excluded.payload_hash,
          lead_id = excluded.lead_id, synced_at = excluded.synced_at`)
          .bind(sourceKey, payloadHash, imported.lead.id, startedAt),
      ]);
      if (imported.merged) result.merged += 1;
      else result.created += 1;
      result.acknowledgements.push({ source_key: sourceKey, payload_hash: payloadHash });
    }

    await writeSyncState({ startedAt, succeededAt: new Date().toISOString(), ...result, error: '' });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronisierung fehlgeschlagen.';
    await writeSyncState({ startedAt, error: message });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
