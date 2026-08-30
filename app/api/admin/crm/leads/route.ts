import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { CRM_STATUSES, mapCrmLead, type CrmLeadInput, type CrmLeadRow, upsertCrmLead } from '../../../../../lib/crm';
import { getStaffUser } from '../../../../staff-auth';

async function requireAdmin() {
  const user = await getStaffUser();
  return user?.role === 'admin' ? user : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get('q')?.trim().slice(0, 120) ?? '';
  const requestedStatus = parameters.get('status')?.trim() ?? '';
  const status = CRM_STATUSES.includes(requestedStatus as (typeof CRM_STATUSES)[number]) ? requestedStatus : '';
  const conditions = status ? ['status = ?'] : ["status <> 'Gelöscht'"];
  const bindings: unknown[] = status ? [status] : [];
  if (query) {
    conditions.push(`(company LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ? OR city LIKE ? OR interest LIKE ? OR summary LIKE ?)`);
    const search = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    bindings.push(search, search, search, search, search, search, search, search);
  }
  const [leadRows, countRows] = await Promise.all([
    env.DB.prepare(`SELECT * FROM crm_leads WHERE ${conditions.join(' AND ')} ORDER BY
      CASE priority WHEN 'Dringend' THEN 0 WHEN 'Hoch' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
      last_contact_at DESC LIMIT 250`).bind(...bindings).all<CrmLeadRow>(),
    env.DB.prepare(`SELECT status, COUNT(*) AS total FROM crm_leads GROUP BY status`).all<{ status: string; total: number }>(),
  ]);
  const counts = Object.fromEntries((countRows.results ?? []).map((row) => [row.status, Number(row.total)]));
  return NextResponse.json(
    { leads: (leadRows.results ?? []).map(mapCrmLead), counts },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  try {
    const input = await request.json() as CrmLeadInput;
    const result = await upsertCrmLead(env.DB, input, user.displayName);
    return NextResponse.json(result, { status: result.merged ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Der Lead konnte nicht gespeichert werden.' }, { status: 422 });
  }
}
