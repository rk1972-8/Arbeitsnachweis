import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../db/ensure';
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_MAX_AGE,
  type StaffUser,
  verifyAdminPin,
  verifyStaffPin,
} from '../../../staff-auth';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function attemptKey(request: Request, identifier: string) {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${identifier.toLocaleLowerCase('de')}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function isLocked(key: string) {
  const row = await env.DB.prepare('SELECT locked_until FROM auth_attempts WHERE attempt_key = ?').bind(key).first<{ locked_until: string | null }>();
  return Boolean(row?.locked_until && Date.parse(row.locked_until) > Date.now());
}

async function recordFailure(key: string) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT attempts, window_started FROM auth_attempts WHERE attempt_key = ?').bind(key).first<{ attempts: number; window_started: string }>();
  const insideWindow = Boolean(row && Date.parse(row.window_started) > now - WINDOW_MS);
  const attempts = insideWindow ? row!.attempts + 1 : 1;
  const windowStarted = insideWindow ? row!.window_started : new Date(now).toISOString();
  const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now + WINDOW_MS).toISOString() : null;
  await env.DB.prepare(`INSERT INTO auth_attempts (attempt_key, attempts, window_started, locked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET attempts = excluded.attempts, window_started = excluded.window_started, locked_until = excluded.locked_until`)
    .bind(key, attempts, windowStarted, lockedUntil)
    .run();
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const input = await request.json() as { mode?: string; name?: string; pin?: string };
    const mode = input.mode === 'admin' ? 'admin' : 'employee';
    const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
    const pin = String(input.pin ?? '').trim();
    if (!/^\d{6}$/.test(pin) || (mode === 'employee' && (!name || name.length > 100))) {
      return NextResponse.json({ error: 'Name oder PIN ist nicht richtig.' }, { status: 401 });
    }

    const key = await attemptKey(request, mode === 'admin' ? 'admin' : name);
    if (await isLocked(key)) return NextResponse.json({ error: 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.' }, { status: 429 });

    let user: StaffUser | null = null;
    if (mode === 'admin') {
      if (await verifyAdminPin(pin)) user = { userId: 'admin', displayName: 'Rolf Köhler', role: 'admin', jobRole: 'Meister' };
    } else {
      const row = await env.DB.prepare('SELECT id, name, job_role, pin_hash, pin_salt FROM app_users WHERE lower(name) = lower(?) AND active = 1')
        .bind(name)
        .first<{ id: string; name: string; job_role: string; pin_hash: string; pin_salt: string }>();
      if (row && await verifyStaffPin(pin, row.pin_salt, row.pin_hash)) {
        user = { userId: row.id, displayName: row.name, role: 'employee', jobRole: row.job_role };
      }
    }

    if (!user) {
      await recordFailure(key);
      return NextResponse.json({ error: 'Name oder PIN ist nicht richtig.' }, { status: 401 });
    }

    await env.DB.prepare('DELETE FROM auth_attempts WHERE attempt_key = ?').bind(key).run();
    const response = NextResponse.json({ authenticated: true, role: user.role });
    response.cookies.set(STAFF_SESSION_COOKIE, await createStaffSessionToken(user), {
      httpOnly: true,
      secure: new URL(request.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: STAFF_SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.' }, { status: 500 });
  }
}
