import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { ensureDatabase } from '../db/ensure';

export type StaffUser = {
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  jobRole: string;
};

export type StaffOption = {
  id: string;
  name: string;
  role: string;
};

export const STAFF_SESSION_COOKIE = 'mifrro_session';
export const STAFF_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function authSecret() {
  const secret = String(env.STAFF_AUTH_SECRET ?? '').trim();
  if (!secret) throw new Error('Die Mitarbeiter-Anmeldung ist noch nicht vollständig eingerichtet.');
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(authSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createStaffSessionToken(user: StaffUser) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    uid: user.userId,
    name: user.displayName,
    role: user.role,
    jobRole: user.jobRole,
    exp: Math.floor(Date.now() / 1000) + STAFF_SESSION_MAX_AGE,
  })));
  return `${payload}.${bytesToBase64Url(await hmac(`session:${payload}`))}`;
}

export async function getStaffUser(): Promise<StaffUser | null> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  try {
    if (!equalBytes(await hmac(`session:${payload}`), base64UrlToBytes(signature))) return null;
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      uid?: string; name?: string; role?: string; jobRole?: string; exp?: number;
    };
    if (!data.uid || !data.name || !data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    if (data.role === 'admin' && data.uid === 'admin') {
      return { userId: 'admin', displayName: 'Rolf Köhler', role: 'admin', jobRole: 'Meister' };
    }
    if (data.role !== 'employee') return null;
    await ensureDatabase();
    const row = await env.DB.prepare('SELECT id, name, job_role FROM app_users WHERE id = ? AND active = 1')
      .bind(data.uid)
      .first<{ id: string; name: string; job_role: string }>();
    return row ? { userId: row.id, displayName: row.name, role: 'employee', jobRole: row.job_role } : null;
  } catch {
    return null;
  }
}

export async function hashStaffPin(pin: string, salt: string) {
  return bytesToBase64Url(await hmac(`pin:${salt}:${pin}`));
}

export async function verifyStaffPin(pin: string, salt: string, expectedHash: string) {
  try {
    return equalBytes(base64UrlToBytes(await hashStaffPin(pin, salt)), base64UrlToBytes(expectedHash));
  } catch {
    return false;
  }
}

export async function verifyAdminPin(pin: string) {
  const expected = String(env.STAFF_ADMIN_PIN ?? '').trim();
  if (!expected) throw new Error('Die Admin-PIN ist noch nicht eingerichtet.');
  return equalBytes(await hmac(`admin-pin:${pin}`), await hmac(`admin-pin:${expected}`));
}

export function generateStaffPin() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

export async function listActiveStaff(): Promise<StaffOption[]> {
  await ensureDatabase();
  const result = await env.DB.prepare('SELECT id, name, job_role FROM app_users WHERE active = 1 ORDER BY name COLLATE NOCASE').all<{ id: string; name: string; job_role: string }>();
  return (result.results ?? []).map((row) => ({ id: row.id, name: row.name, role: row.job_role }));
}

