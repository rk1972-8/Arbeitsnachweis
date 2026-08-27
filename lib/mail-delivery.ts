import { env } from 'cloudflare:workers';
import { MIFRRO_COMPANY } from './email';

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

async function relaySignature(secret: string, timestamp: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}\n${payload}`)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deliverMail(input: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody: string;
  senderName: string;
  attachment?: { filename: string; bytes: ArrayBuffer | Uint8Array };
}) {
  const attachment = input.attachment ? toBase64(input.attachment.bytes) : '';
  const relayUrl = String(env.GOOGLE_SCRIPT_MAIL_URL ?? '').trim();
  const relaySecret = String(env.MAIL_RELAY_SECRET ?? '').trim();
  if (relayUrl && relaySecret) {
    const message = {
      to: input.to,
      cc: input.cc ?? '',
      subject: input.subject,
      body: input.body,
      htmlBody: input.htmlBody,
      filename: input.attachment?.filename ?? '',
      contentBase64: attachment,
      senderName: `${input.senderName} | ${MIFRRO_COMPANY.name}`,
      replyTo: MIFRRO_COMPANY.email,
    };
    const payload = toBase64(new TextEncoder().encode(JSON.stringify(message)).buffer as ArrayBuffer);
    const timestamp = String(Date.now());
    const signature = await relaySignature(relaySecret, timestamp, payload);
    const response = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timestamp, payload, signature }),
      redirect: 'follow',
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) throw new Error(result?.error || `E-Mail-Versand über Google fehlgeschlagen (HTTP ${response.status}).`);
    return;
  }

  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  const from = String(env.MAIL_FROM ?? '').trim();
  if (!apiKey || !from) throw new Error('Der E-Mail-Versand ist noch nicht eingerichtet.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      cc: input.cc ? [input.cc] : undefined,
      subject: input.subject,
      html: input.htmlBody,
      attachments: input.attachment ? [{ filename: input.attachment.filename, content: attachment }] : undefined,
    }),
  });
  if (!response.ok) throw new Error(`E-Mail-Versand fehlgeschlagen (HTTP ${response.status}).`);
}
