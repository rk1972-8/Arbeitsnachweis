import type { AnalysisResult, WorkReportDraft } from './types';

type ResponsePayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(payload: ResponsePayload): string {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  throw new Error('Die Diktat-Auswertung hat keinen Text zurückgegeben.');
}

export async function analyzeDictation(apiKey: string, draft: WorkReportDraft): Promise<AnalysisResult> {
  if (!apiKey) throw new Error('OPENAI_API_KEY ist noch nicht eingerichtet.');
  const dictation = draft.dictation.trim();
  if (!dictation) throw new Error('Bitte zuerst einen Arbeitsbericht diktieren oder eingeben.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.6',
      instructions: 'Du strukturierst Arbeitsberichte eines deutschen Klima-, Kälte- und Haustechnik-Fachbetriebs. Verwende ausschließlich Angaben aus dem Diktat, erfinde nichts und erhalte Zahlen, Mengen, technische Werte und Modellbezeichnungen exakt.',
      input: `Datum: ${draft.workDate}\nKunde: ${draft.customer.company || draft.customer.fullName}\nEinsatzadresse: ${draft.workAddress}\n\nDiktat:\n${dictation}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'arbeitsnachweis_auswertung',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['workMinutes', 'driveMinutes', 'workDescription', 'materials', 'findings', 'complaints', 'recommendations', 'internalNotes', 'notes'],
            properties: {
              workMinutes: { type: 'integer', minimum: 0 },
              driveMinutes: { type: 'integer', minimum: 0 },
              workDescription: { type: 'string' },
              materials: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['quantity', 'unit', 'name', 'searchTerm'],
                  properties: {
                    quantity: { type: 'number', minimum: 0 },
                    unit: { type: 'string' },
                    name: { type: 'string' },
                    searchTerm: { type: 'string' },
                  },
                },
              },
              findings: { type: 'string' },
              complaints: { type: 'string' },
              recommendations: { type: 'string' },
              internalNotes: { type: 'string' },
              notes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Diktat-Auswertung fehlgeschlagen (HTTP ${response.status}): ${detail}`);
  }
  const payload = await response.json() as ResponsePayload;
  return JSON.parse(outputText(payload)) as AnalysisResult;
}
