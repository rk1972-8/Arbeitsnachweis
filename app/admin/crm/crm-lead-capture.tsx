'use client';

import type { CrmContactExtraction } from '../../../lib/crm-contact-extraction';
import { ContactCapture } from '../../contact-capture';

export function CrmLeadCapture({ onExtract }: { onExtract: (result: CrmContactExtraction) => void }) {
  return <ContactCapture
    endpoint="/api/admin/crm/extract"
    onExtract={onExtract}
    dictationPlaceholder="Zum Beispiel: Neuer Interessent Firma Maier, Ansprechpartner Herr Thomas Maier, Telefon … interessiert sich für eine Klimaanlage …"
  />;
}
