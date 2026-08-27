import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));

const allowedNames = new Set(['PLENTY_BASE_URL', 'PLENTY_USERNAME', 'PLENTY_PASSWORD']);
const envName = String(args['env-name'] || '');
if (!allowedNames.has(envName)) throw new Error('Nicht erlaubter Einstellungsname.');

const workspace = fs.realpathSync(String(args.workspace || ''));
const target = path.resolve(String(args.target || ''));
const relativeTarget = path.relative(workspace, target);
if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
  throw new Error('Der Speicherort liegt außerhalb des App-Ordners.');
}

if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
  throw new Error('Verknüpfte Einstellungsdateien werden nicht beschrieben.');
}

const privateJwk = JSON.parse(fs.readFileSync(String(args['private-key']), 'utf8'));
const encrypted = JSON.parse(fs.readFileSync(String(args['encrypted-result']), 'utf8'));
const ciphertext = encrypted?.encrypted_api_key?.ciphertext;
if (typeof ciphertext !== 'string' || !ciphertext) throw new Error('Verschlüsselter Wert fehlt.');

const privateKey = await webcrypto.subtle.importKey(
  'jwk',
  privateJwk,
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false,
  ['decrypt'],
);
const plaintext = Buffer.from(await webcrypto.subtle.decrypt(
  { name: 'RSA-OAEP' },
  privateKey,
  Buffer.from(ciphertext, 'base64url'),
)).toString('utf8');

if (!plaintext || plaintext.length > 1000 || /[\r\n\0]/.test(plaintext)) {
  throw new Error('Der entschlüsselte Wert ist ungültig.');
}
if (envName === 'PLENTY_BASE_URL') {
  const url = new URL(plaintext);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.plentysystems.com')) {
    throw new Error('Die Plenty-Adresse ist ungültig.');
  }
}

const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
const entry = `${envName}=${JSON.stringify(plaintext)}`;
const expression = new RegExp(`^${envName}=.*$`, 'm');
const updated = expression.test(current)
  ? current.replace(expression, entry)
  : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`;
const temporary = `${target}.tmp-${process.pid}`;
fs.writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
fs.renameSync(temporary, target);
fs.chmodSync(target, 0o600);

process.stdout.write(JSON.stringify({ target, envName, configured: true }));
