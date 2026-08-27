import type { Customer, PersonnelRow } from './types';

export const MIFRRO_COMPANY = {
  name: 'mifrro Vertriebs GmbH',
  street: 'Von-Braun-Str. 25a',
  city: '52511 Geilenkirchen',
  phone: '+49 2451 9116960',
  email: 'info@mifrro.de',
  website: 'www.smartklimatisieren.de',
  websiteUrl: 'https://www.smartklimatisieren.de',
  imprintUrl: 'https://www.smartklimatisieren.de/allgemeine-seiten/impressum',
  managingDirector: 'Rolf Köhler',
  registryCourt: 'Amtsgericht Aachen',
  registryNumber: 'HRB 15037',
  vatId: 'DE261670620',
} as const;

function normalized(value: string | undefined) {
  return String(value ?? '').trim().toLocaleLowerCase('de-DE');
}

function recipientName(customer: Customer) {
  const formalName = [customer.title, customer.lastName].filter(Boolean).join(' ').trim();
  return formalName || customer.fullName.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
}

export function customerGreeting(customer: Customer) {
  const name = recipientName(customer);
  const formOfAddress = normalized(customer.formOfAddress);
  const gender = normalized(customer.gender);

  if ((formOfAddress.includes('frau') || gender === 'female') && name) return `Sehr geehrte Frau ${name},`;
  if ((formOfAddress.includes('herr') || gender === 'male') && name) return `Sehr geehrter Herr ${name},`;
  if (name) return `Guten Tag ${customer.fullName.trim() || name},`;
  return 'Sehr geehrte Damen und Herren,';
}

export function reportSenderName(personnel: PersonnelRow[], fallback: string) {
  return personnel.find((row) => row.name.trim())?.name.trim() || fallback.trim() || MIFRRO_COMPANY.managingDirector;
}

export function buildWorkReportEmailBody(input: {
  customer: Customer;
  reportNumber: string;
  workDate: string;
  recommendations: string;
  senderName: string;
}) {
  const date = new Date(`${input.workDate}T12:00:00`).toLocaleDateString('de-DE');
  const outstandingWork = input.recommendations.trim();
  const outstandingParagraph = outstandingWork
    ? `\n\nFolgende weitere Arbeiten wurden vor Ort besprochen beziehungsweise sind noch zu erledigen:\n${outstandingWork}`
    : '';

  return `${customerGreeting(input.customer)}\n\nim Anhang übermitteln wir Ihnen unseren Arbeitsnachweis ${input.reportNumber} vom ${date}.${outstandingParagraph}\n\nFür Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${input.senderName}`;
}

export function appendMifrroImprint(body: string) {
  return `${body.trim()}\n\nM  ${MIFRRO_COMPANY.name}\n${MIFRRO_COMPANY.street}\n${MIFRRO_COMPANY.city}\nTelefon: ${MIFRRO_COMPANY.phone}\nE-Mail: ${MIFRRO_COMPANY.email}\nWeb: ${MIFRRO_COMPANY.website}\n\nGeschäftsführer: ${MIFRRO_COMPANY.managingDirector}\nRegistergericht: ${MIFRRO_COMPANY.registryCourt} · ${MIFRRO_COMPANY.registryNumber}\nUSt-IdNr.: ${MIFRRO_COMPANY.vatId}\nImpressum: ${MIFRRO_COMPANY.imprintUrl}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function messageHtml(body: string) {
  return body.trim().split(/\n{2,}/).map((paragraph) => (
    `<p style="margin:0 0 18px;line-height:1.6;color:#202724;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
  )).join('');
}

export function buildMifrroEmailHtml(body: string) {
  const company = MIFRRO_COMPANY;
  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#202724;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dfe6e2;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:32px 36px 20px;">${messageHtml(body)}</td></tr>
          <tr><td style="padding:0 36px 34px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:2px solid #1d6b4f;padding-top:24px;">
              <tr>
                <td width="58" valign="top"><div style="width:44px;height:44px;line-height:44px;text-align:center;border-radius:10px;background:#1d6b4f;color:#ffffff;font-size:25px;font-weight:700;">M</div></td>
                <td valign="top" style="font-size:13px;line-height:1.55;color:#56615c;">
                  <strong style="display:block;font-size:16px;color:#202724;margin-bottom:4px;">${company.name}</strong>
                  ${company.street} · ${company.city}<br>
                  Telefon: <a href="tel:+4924519116960" style="color:#1d6b4f;text-decoration:none;">${company.phone}</a><br>
                  E-Mail: <a href="mailto:${company.email}" style="color:#1d6b4f;text-decoration:none;">${company.email}</a><br>
                  Web: <a href="${company.websiteUrl}" style="color:#1d6b4f;text-decoration:none;">${company.website}</a>
                </td>
              </tr>
              <tr><td colspan="2" style="padding-top:18px;font-size:11px;line-height:1.55;color:#78817d;">
                Geschäftsführer: ${company.managingDirector} · Registergericht: ${company.registryCourt} · ${company.registryNumber}<br>
                USt-IdNr.: ${company.vatId} · <a href="${company.imprintUrl}" style="color:#56615c;">Impressum</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
