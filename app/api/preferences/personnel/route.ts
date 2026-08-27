import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../db/ensure';
import { DEFAULT_PERSONNEL_ROLE, isPersonnelRole } from '../../../../lib/personnel';
import { getStaffUser } from '../../../staff-auth';

type PreferenceRow = { employee_name: string; role: string };

export async function GET() {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  await ensureDatabase();
  const row = await env.DB.prepare(
    'SELECT employee_name, role FROM personnel_preferences WHERE owner_id = ?',
  ).bind(user.userId).first<PreferenceRow>();

  return NextResponse.json({
    preference: row ? {
      name: row.employee_name.slice(0, 100),
      role: isPersonnelRole(row.role) ? row.role : DEFAULT_PERSONNEL_ROLE,
    } : null,
  });
}

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  const payload = await request.json() as { name?: string; role?: string };
  const name = String(payload.name ?? '').trim();
  const role = String(payload.role ?? '').trim();
  if (name.length > 100) return NextResponse.json({ error: 'Der Name ist zu lang.' }, { status: 422 });
  if (!isPersonnelRole(role)) return NextResponse.json({ error: 'Unbekannte Rolle.' }, { status: 422 });

  await ensureDatabase();
  await env.DB.prepare(`INSERT INTO personnel_preferences (owner_id, employee_name, role, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      employee_name = excluded.employee_name,
      role = excluded.role,
      updated_at = excluded.updated_at`)
    .bind(user.userId, name, role, new Date().toISOString())
    .run();

  return NextResponse.json({ saved: true });
}
