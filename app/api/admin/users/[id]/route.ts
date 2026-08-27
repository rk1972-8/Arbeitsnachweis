import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { generateStaffPin, getStaffUser, hashStaffPin } from '../../../../staff-auth';

async function requireAdmin() {
  const user = await getStaffUser();
  return user?.role === 'admin';
}

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const pin = generateStaffPin();
  const salt = crypto.randomUUID();
  const result = await env.DB.prepare('UPDATE app_users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ? AND active = 1')
    .bind(await hashStaffPin(pin, salt), salt, new Date().toISOString(), id)
    .run();
  if (!result.meta.changes) return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ pin });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  await env.DB.prepare('UPDATE app_users SET active = 0, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return NextResponse.json({ deleted: true });
}
