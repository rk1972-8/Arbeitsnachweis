import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { analyzeDictation } from '../../../lib/openai-analysis';
import type { WorkReportDraft } from '../../../lib/types';
import { getStaffUser } from '../../staff-auth';

export async function POST(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  try {
    const draft = await request.json() as WorkReportDraft;
    const result = await analyzeDictation(String(env.OPENAI_API_KEY ?? ''), draft);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auswertung fehlgeschlagen.' },
      { status: 422 },
    );
  }
}
