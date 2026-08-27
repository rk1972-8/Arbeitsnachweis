import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../db/ensure';
import { PERSONNEL_ROLES } from '../../../../lib/personnel';
import { generateStaffPin, getStaffUser, hashStaffPin } from '../../../staff-auth';

async function requireAdmin() {
  const user = await getStaffUser();
  return user?.role === 'admin' ? user : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const rows = await env.DB.prepare('SELECT id, name, job_role, created_at FROM app_users WHERE active = 1 ORDER BY name COLLATE NOCASE').all();
  return NextResponse.json({ users: rows.results ?? [] });
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    await ensureDatabase();
    const input = await request.json() as { name?: string; jobRole?: string };
    const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
    const jobRole = String(input.jobRole ?? '').trim();
    if (name.length < 3 || name.length > 100) throw new Error('Bitte Vor- und Nachname eingeben.');
    if (!PERSONNEL_ROLES.includes(jobRole as (typeof PERSONNEL_ROLES)[number])) throw new Error('Bitte eine gültige Rolle auswählen.');
    const duplicate = await env.DB.prepare('SELECT id FROM app_users WHERE lower(name) = lower(?) AND active = 1').bind(name).first();
    if (duplicate) return NextResponse.json({ error: 'Dieser Mitarbeiter ist bereits vorhanden.' }, { status: 409 });

    const id = crypto.randomUUID();
    const pin = generateStaffPin();
    const salt = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO app_users (id, name, job_role, pin_hash, pin_salt, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(id, name, jobRole, await hashStaffPin(pin, salt), salt, now, now)
      .run();
    return NextResponse.json({ user: { id, name, job_role: jobRole, created_at: now }, pin }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mitarbeiter konnte nicht angelegt werden.' }, { status: 422 });
  }
}
