import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { extractCrmContact } from '../../../../../lib/crm-contact-extraction';
import { getStaffUser } from '../../../../staff-auth';

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    const body = await request.json() as { text?: string; imageDataUrl?: string; mode?: string };
    const result = await extractCrmContact(String(env.OPENAI_API_KEY ?? ''), body);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kundendaten konnten nicht ausgewertet werden.' }, { status: 422 });
  }
}
