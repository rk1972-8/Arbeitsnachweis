import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getStaffUser } from '../../staff-auth';
import { ensureDatabase } from '../../../db/ensure';
import { withAutomaticPositions } from '../../../lib/automatic-positions';
import { createReportPdf } from '../../../lib/pdf';
import type { WorkReportDraft } from '../../../lib/types';
import { buildMifrroEmailHtml } from '../../../lib/email';
import { deliverMail } from '../../../lib/mail-delivery';

function dataUrlBytes(value?: string): Uint8Array | undefined {
  if (!value) return undefined;
  const match = value.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return undefined;
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateDraft(draft: WorkReportDraft) {
  if (!draft?.customer?.id) throw new Error('Bitte einen Kunden auswählen.');
  if (!draft.workDate) throw new Error('Das Einsatzdatum fehlt.');
  if (!draft.workAddress.trim()) throw new Error('Die Einsatzadresse fehlt.');
  if (!draft.workDescription.trim()) throw new Error('Die ausgeführten Arbeiten fehlen.');
  if (!draft.signerName.trim()) throw new Error('Der Name der unterschreibenden Person fehlt.');
  const route = draft.positions.find((row) => row.sourceType === 'route');
  if (!route) throw new Error('Die Anfahrt fehlt. Bitte Kilometer oder eine Anfahrtspauschale eintragen.');
  if (!route.variationId && draft.distanceKm <= 0) {
    throw new Error('Bitte Kilometer eintragen oder die Anfahrtspauschale manuell auswählen.');
  }
}

function normalizeWorkHours(draft: WorkReportDraft): WorkReportDraft {
  if (draft.workMinutes <= 0 || draft.personnel.length !== 1 || draft.personnel[0].hours > 0) return draft;
  return {
    ...draft,
    personnel: [{
      ...draft.personnel[0],
      hours: Math.round((draft.workMinutes / 60) * 100) / 100,
    }],
  };
}

export async function POST(request: Request) {
  try {
    const user = await getStaffUser();
    if (!user) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
    const submitted = normalizeWorkHours(await request.json() as WorkReportDraft);
    const draft = {
      ...submitted,
      positions: withAutomaticPositions(submitted.positions, submitted.personnel, submitted.distanceKm, submitted.driveMinutes),
    };
    validateDraft(draft);
    await ensureDatabase();

    const id = crypto.randomUUID();
    const year = new Date().getFullYear();
    const reportNumber = `AN-${year}-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    const signature = dataUrlBytes(draft.signatureDataUrl);
    const signatureKey = signature ? `signatures/${id}.png` : null;
    const pdfKey = `reports/${id}.pdf`;

    if (signature && signatureKey) {
      await env.FILES.put(signatureKey, signature, { httpMetadata: { contentType: 'image/png' } });
    }
    const pdf = await createReportPdf(draft, reportNumber, signature);
    await env.FILES.put(pdfKey, pdf, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { reportNumber, ownerId: user.userId },
    });

    const reportFields: Array<[string, string | number | null]> = [
      ['id', id],
      ['report_number', reportNumber],
      ['owner_id', user.userId],
      ['status', user.role === 'admin' ? 'signed' : 'pending_review'],
      ['customer_id', draft.customer.id],
      ['customer_company', draft.customer.company],
      ['customer_name', draft.customer.fullName],
      ['customer_email', draft.customer.email],
      ['customer_address', `${draft.customer.street} ${draft.customer.houseNumber}, ${draft.customer.zip} ${draft.customer.city}`.trim()],
      ['work_date', draft.workDate],
      ['work_address', draft.workAddress],
      ['work_minutes', Math.max(0, Math.round(draft.workMinutes))],
      ['drive_minutes', Math.max(0, Math.round(draft.driveMinutes))],
      ['distance_km', Math.max(0, Number(draft.distanceKm) || 0)],
      ['work_description', draft.workDescription],
      ['findings', draft.findings],
      ['complaints', draft.complaints],
      ['recommendations', draft.recommendations],
      ['internal_notes', draft.internalNotes],
      ['personnel_json', JSON.stringify(draft.personnel)],
      ['positions_json', JSON.stringify(draft.positions)],
      ['signer_name', draft.signerName],
      ['signature_key', signatureKey],
      ['pdf_key', pdfKey],
      ['created_at', now],
      ['updated_at', now],
    ];
    const columns = reportFields.map(([column]) => column).join(', ');
    const placeholders = reportFields.map(() => '?').join(', ');
    await env.DB.prepare(`INSERT INTO work_reports (${columns}) VALUES (${placeholders})`)
      .bind(...reportFields.map(([, value]) => value))
      .run();

    let notified = true;
    if (user.role === 'employee') {
      const reviewUrl = `${new URL(request.url).origin}/admin/reports/${id}`;
      const message = `Hallo Rolf,\n\n${user.displayName} hat den Arbeitsnachweis ${reportNumber} für ${draft.customer.company || draft.customer.fullName} eingereicht.\n\nBitte prüfe ihn in der Admin-Oberfläche. Der unterschriebene Teil bleibt unverändert; Büro-Nachträge können separat ergänzt werden.\n\nPrüfen: ${reviewUrl}`;
      try {
        await deliverMail({
          to: String(env.MAIL_CC ?? 'info@mifrro.de').trim(),
          subject: `Zur Prüfung: ${reportNumber} von ${user.displayName}`,
          body: message,
          htmlBody: buildMifrroEmailHtml(message),
          senderName: user.displayName,
          attachment: { filename: `${reportNumber}.pdf`, bytes: pdf },
        });
      } catch {
        notified = false;
      }
    }

    return NextResponse.json({ id, reportNumber, pdfUrl: `/api/reports/${id}/pdf`, pendingReview: user.role === 'employee', notified });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Arbeitsnachweis konnte nicht gespeichert werden.' },
      { status: 422 },
    );
  }
}
