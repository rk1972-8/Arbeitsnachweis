export type CrmContactExtraction = {
  source: string;
  company: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  street: string;
  house_number: string;
  zip: string;
  city: string;
  interest: string;
  manufacturer: string;
  rooms: string;
  area: string;
  summary: string;
  review_notes: string[];
};

type ResponsePayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function responseText(payload: ResponsePayload) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  throw new Error('Die Kundendaten-Auswertung hat keinen Text zurückgegeben.');
}

function imageMimeType(dataUrl: string) {
  return /^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl);
}

export async function extractCrmContact(apiKey: string, input: { text?: string; imageDataUrl?: string; mode?: string }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY ist noch nicht eingerichtet.');
  const text = String(input.text ?? '').trim().slice(0, 20_000);
  const imageDataUrl = String(input.imageDataUrl ?? '').trim();
  const source = imageDataUrl ? 'Foto' : input.mode === 'dictation' ? 'Diktat' : 'Text';
  if (!text && !imageDataUrl) throw new Error('Bitte Text diktieren, einfügen oder ein Foto aufnehmen.');
  if (imageDataUrl && (!imageMimeType(imageDataUrl) || imageDataUrl.length > 12_000_000)) {
    throw new Error('Das Foto muss eine JPEG-, PNG- oder WebP-Datei mit höchstens etwa 8 MB sein.');
  }

  const content: Array<Record<string, unknown>> = [{
    type: 'input_text',
    text: `Eingabeart: ${source}. Erfasse aus den folgenden Angaben einen möglichen Neukunden oder Interessenten.\n\n${text || 'Es liegt nur das Foto eines Geschäftspapiers vor.'}`,
  }];
  if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'high' });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.6',
      instructions: `Du extrahierst Kontaktdaten für das CRM eines deutschen Klima-, Kälte- und Haustechnik-Fachbetriebs.
Verwende ausschließlich klar erkennbare Angaben aus Text oder Foto und erfinde nichts. Nicht vorhandene oder unsichere Felder bleiben leer.
Bei Geschäftspapier ist die Firma im Briefkopf beziehungsweise der Absender in der Regel der neue Kontakt. Ignoriere erkennbare eigene MIFRRO-Kontaktdaten.
Trenne Straße und Hausnummer. Übernimm Telefonnummern, E-Mail-Adressen, Postleitzahlen, technische Hersteller- und Produktbezeichnungen exakt.
Formuliere summary als knappe, sachliche Zusammenfassung der Anfrage. Schreibe Unsicherheiten oder mehrere mögliche Ansprechpartner in review_notes.
source ist abhängig von der Eingabe entweder Foto, Diktat oder Text.`,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'crm_kontakterfassung',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['source', 'company', 'first_name', 'last_name', 'phone', 'email', 'street', 'house_number', 'zip', 'city', 'interest', 'manufacturer', 'rooms', 'area', 'summary', 'review_notes'],
            properties: {
              source: { type: 'string' },
              company: { type: 'string' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' },
              street: { type: 'string' },
              house_number: { type: 'string' },
              zip: { type: 'string' },
              city: { type: 'string' },
              interest: { type: 'string' },
              manufacturer: { type: 'string' },
              rooms: { type: 'string' },
              area: { type: 'string' },
              summary: { type: 'string' },
              review_notes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error(`Kundendaten-Auswertung fehlgeschlagen (HTTP ${response.status}).`);
  }
  const extracted = JSON.parse(responseText(await response.json() as ResponsePayload)) as CrmContactExtraction;
  return { ...extracted, source };
}
