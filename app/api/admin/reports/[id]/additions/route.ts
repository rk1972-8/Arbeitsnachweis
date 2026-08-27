import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../../db/ensure';
import { appendOfficeAddition, type ReportAddition, type ReportAdditionContext } from '../../../../../../lib/report-addition-pdf';
import { getStaffUser } from '../../../../../staff-auth';

type AdditionRow = { quantity: number; unit: string; title: string; item_id: string | null; variation_id: string | null; reason: string; added_by: string; created_at: string };
type ReportRow = ReportAdditionContext & { status: string };

async function rebuildPdf(reportId: string, report: ReportAdditionContext) {
  const original = await env.FILES.get(`reports/${reportId}.pdf`);
  if (!original) throw new Error('Die unterschriebene Original-PDF wurde nicht gefunden.');
  const rows = await env.DB.prepare(`SELECT quantity, unit, title, item_id, variation_id, reason, added_by, created_at
    FROM report_additions WHERE report_id = ? ORDER BY created_at`).bind(reportId).all<AdditionRow>();
  const additions: ReportAddition[] = (rows.results ?? []).map((row) => ({
    quantity: row.quantity,
    unit: row.unit,
    title: row.title,
    itemId: row.item_id ?? '',
    variationId: row.variation_id ?? '',
    reason: row.reason,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }));
  const pdfKey = additions.length ? `reports/${reportId}-final.pdf` : `reports/${reportId}.pdf`;
  if (additions.length) {
    const finalPdf = await appendOfficeAddition(await original.arrayBuffer(), report, additions);
    await env.FILES.put(pdfKey, finalPdf, { httpMetadata: { contentType: 'application/pdf' } });
  }
  await env.DB.prepare("UPDATE work_reports SET pdf_key = ?, status = 'signed', updated_at = ? WHERE id = ?")
    .bind(pdfKey, new Date().toISOString(), reportId)
    .run();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    await ensureDatabase();
    const { id: reportId } = await context.params;
    const row = await env.DB.prepare(`SELECT report_number, status, customer_company, customer_name,
      customer_address, work_address, work_date FROM work_reports WHERE id = ?`)
      .bind(reportId)
      .first<{
        report_number: string;
        status: string;
        customer_company: string;
        customer_name: string;
        customer_address: string;
        work_address: string;
        work_date: string;
      }>();
    const report: ReportRow | null = row ? {
      reportNumber: row.report_number,
      status: row.status,
      customerCompany: row.customer_company,
      customerName: row.customer_name,
      customerAddress: row.customer_address,
      workAddress: row.work_address,
      workDate: row.work_date,
    } : null;
    if (!report) return NextResponse.json({ error: 'Arbeitsnachweis nicht gefunden.' }, { status: 404 });
    if (report.status === 'sent') return NextResponse.json({ error: 'Ein bereits versendeter Nachweis kann nicht ergänzt werden.' }, { status: 409 });
    const input = await request.json() as { quantity?: number; unit?: string; title?: string; itemId?: string; variationId?: string; reason?: string };
    const quantity = Math.max(0.01, Number(input.quantity) || 1);
    const unit = String(input.unit ?? 'Stück').trim().slice(0, 30);
    const title = String(input.title ?? '').trim().slice(0, 180);
    const itemId = String(input.itemId ?? '').trim().slice(0, 40);
    const variationId = String(input.variationId ?? '').trim().slice(0, 40);
    const reason = String(input.reason ?? '').trim().slice(0, 500);
    if (!title) throw new Error('Bitte eine Bezeichnung für den Nachtrag eingeben.');
    const additionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO report_additions (id, report_id, quantity, unit, title, item_id, variation_id, reason, added_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(additionId, reportId, quantity, unit, title, itemId || null, variationId || null, reason, user.displayName, now)
      .run();
    await rebuildPdf(reportId, report);
    return NextResponse.json({ added: true, id: additionId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nachtrag konnte nicht gespeichert werden.' }, { status: 422 });
  }
}
