import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../../../db/ensure';
import { mapCrmLead, type CrmLeadRow } from '../../../../../../../lib/crm';
import { createCustomer } from '../../../../../../../lib/plenty';
import type { Customer, NewCustomerInput } from '../../../../../../../lib/types';
import { getStaffUser } from '../../../../../../staff-auth';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();
  const { id } = await context.params;
  const row = await env.DB.prepare('SELECT * FROM crm_leads WHERE id = ?').bind(id).first<CrmLeadRow>();
  if (!row) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
  const lead = mapCrmLead(row);
  try {
    const body = await request.json().catch(() => ({})) as { force?: boolean; existingCustomer?: Customer };
    let customer = body.existingCustomer;
    if (!customer) {
      const input: NewCustomerInput = {
        company: lead.company, firstName: lead.first_name, lastName: lead.last_name, email: lead.email, phone: lead.phone,
        street: lead.street, houseNumber: lead.house_number, zip: lead.zip, city: lead.city,
      };
      const result = await createCustomer(env, input, body.force === true);
      if (result.duplicates?.length) return NextResponse.json({ duplicates: result.duplicates }, { status: 409 });
      customer = result.customer;
    }
    if (!customer?.id) throw new Error('Plenty hat keinen Kunden zurückgegeben.');
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE crm_leads SET plenty_contact_id = ?, plenty_address_id = ?, plenty_exported_at = ?,
      plenty_export_error = NULL, updated_at = ? WHERE id = ?`)
      .bind(customer.id, customer.billingAddressId ?? null, now, now, id).run();
    return NextResponse.json({ customer, exportedAt: now }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Übergabe an Plenty fehlgeschlagen.';
    await env.DB.prepare('UPDATE crm_leads SET plenty_export_error = ?, updated_at = ? WHERE id = ?')
      .bind(message.slice(0, 1_000), new Date().toISOString(), id).run();
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
