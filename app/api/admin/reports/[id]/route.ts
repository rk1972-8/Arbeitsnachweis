import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { getStaffUser } from '../../../../staff-auth';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const report = await env.DB.prepare(`SELECT r.*, COALESCE(u.name, 'Rolf Köhler') AS employee_name
    FROM work_reports r LEFT JOIN app_users u ON u.id = r.owner_id WHERE r.id = ?`).bind(id).first();
  if (!report) return NextResponse.json({ error: 'Arbeitsnachweis nicht gefunden.' }, { status: 404 });
  const additions = await env.DB.prepare(`SELECT id, quantity, unit, title, item_id, variation_id, reason, added_by, created_at
    FROM report_additions WHERE report_id = ? ORDER BY created_at`).bind(id).all();
  return NextResponse.json({ report, additions: additions.results ?? [] });
}
