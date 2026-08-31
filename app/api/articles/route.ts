import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { listArticleManufacturers, searchArticles } from '../../../lib/plenty';
import { getStaffUser } from '../../staff-auth';

export async function GET(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get('q')?.trim() ?? '';
  const status = parameters.get('status');
  const normalizedStatus = status === 'inactive' || status === 'all' ? status : 'active';
  const manufacturer = parameters.get('manufacturer')?.trim() ?? '';
  try {
    if (parameters.get('facets') === '1') return NextResponse.json({ manufacturers: await listArticleManufacturers(env) });
    if (query.length < 2 && !manufacturer && normalizedStatus === 'active') return NextResponse.json({ articles: [] });
    return NextResponse.json({ articles: await searchArticles(env, query, { status: normalizedStatus, manufacturer }) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Artikelsuche fehlgeschlagen.' },
      { status: 502 },
    );
  }
}
