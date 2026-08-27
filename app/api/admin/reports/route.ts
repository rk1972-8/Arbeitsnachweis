import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../db/ensure';
import { getStaffUser } from '../../../staff-auth';

export async function GET() {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const rows = await env.DB.prepare(`SELECT r.id, r.report_number, r.status, r.customer_company, r.customer_name,
      r.customer_email, r.work_date, r.created_at, COALESCE(u.name, 'Rolf Köhler') AS employee_name,
      (SELECT COUNT(*) FROM report_additions a WHERE a.report_id = r.id) AS addition_count,
      (SELECT d.status FROM plenty_order_drafts d WHERE d.report_id = r.id) AS order_status,
      (SELECT d.plenty_order_id FROM plenty_order_drafts d WHERE d.report_id = r.id) AS plenty_order_id
    FROM work_reports r
    LEFT JOIN app_users u ON u.id = r.owner_id
    ORDER BY CASE r.status WHEN 'pending_review' THEN 0 WHEN 'signed' THEN 1 ELSE 2 END, r.updated_at DESC
    LIMIT 100`).all();
  return NextResponse.json(
    { reports: rows.results ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
