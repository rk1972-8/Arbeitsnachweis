import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getStaffUser } from '../../../../staff-auth';
import { ensureDatabase } from '../../../../../db/ensure';
import { appendMifrroImprint, buildMifrroEmailHtml, MIFRRO_COMPANY } from '../../../../../lib/email';
import { deliverMail } from '../../../../../lib/mail-delivery';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getStaffUser();
    if (!user) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
    if (user.role !== 'admin') return NextResponse.json({ error: 'Der Arbeitsnachweis muss zuerst vom Büro geprüft werden.' }, { status: 403 });
    await ensureDatabase();
    const { id } = await context.params;
    const input = await request.json() as { to?: string; subject?: string; body?: string; senderName?: string };
    const to = String(input.to ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error('Bitte eine gültige Empfängeradresse eingeben.');
    const row = await env.DB.prepare('SELECT pdf_key, report_number FROM work_reports WHERE id = ?')
      .bind(id)
      .first<{ pdf_key: string | null; report_number: string | null }>();
    if (!row?.pdf_key) throw new Error('Die PDF wurde nicht gefunden.');
    const pdf = await env.FILES.get(row.pdf_key);
    if (!pdf) throw new Error('Die PDF wurde nicht gefunden.');

    const subject = String(input.subject ?? `Arbeitsnachweis ${row.report_number ?? ''}`).trim();
    const body = String(input.body ?? 'Anbei erhalten Sie den Arbeitsnachweis.').trim();
    const senderName = String(input.senderName ?? MIFRRO_COMPANY.managingDirector).trim() || MIFRRO_COMPANY.managingDirector;
    const plainBody = appendMifrroImprint(body);
    const htmlBody = buildMifrroEmailHtml(body);
    const cc = String(env.MAIL_CC ?? 'info@mifrro.de').trim();
    const filename = `${row.report_number ?? 'Arbeitsnachweis'}.pdf`;
    await deliverMail({
      to,
      cc,
      subject,
      body: plainBody,
      htmlBody,
      senderName,
      attachment: { filename, bytes: await pdf.arrayBuffer() },
    });
    await env.DB.prepare("UPDATE work_reports SET status = 'sent', sent_to = ?, updated_at = ? WHERE id = ?")
      .bind(to, new Date().toISOString(), id)
      .run();
    return NextResponse.json({ sent: true, to });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'E-Mail konnte nicht versendet werden.' },
      { status: 422 },
    );
  }
}
