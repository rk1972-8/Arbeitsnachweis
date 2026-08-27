import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { searchArticles } from '../../../lib/plenty';
import { getStaffUser } from '../../staff-auth';

export async function GET(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ articles: [] });
  try {
    return NextResponse.json({ articles: await searchArticles(env, query) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Artikelsuche fehlgeschlagen.' },
      { status: 502 },
    );
  }
}
