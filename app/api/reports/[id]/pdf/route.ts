import { env } from 'cloudflare:workers';
import { getStaffUser } from '../../../../staff-auth';
import { ensureDatabase } from '../../../../../db/ensure';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (!user) return new Response('Nicht angemeldet', { status: 401 });
  await ensureDatabase();
  const { id } = await context.params;
  const row = await env.DB.prepare(user.role === 'admin'
    ? 'SELECT pdf_key, report_number FROM work_reports WHERE id = ?'
    : 'SELECT pdf_key, report_number FROM work_reports WHERE id = ? AND owner_id = ?')
    .bind(...(user.role === 'admin' ? [id] : [id, user.userId]))
    .first<{ pdf_key: string | null; report_number: string | null }>();
  if (!row?.pdf_key) return new Response('PDF nicht gefunden', { status: 404 });
  const object = await env.FILES.get(row.pdf_key);
  if (!object) return new Response('PDF nicht gefunden', { status: 404 });
  return new Response(object.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${row.report_number ?? 'Arbeitsnachweis'}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
