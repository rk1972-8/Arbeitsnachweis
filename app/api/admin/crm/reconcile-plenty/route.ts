import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../db/ensure';
import { normalizeLeadName, normalizePhone, type CrmLeadRow } from '../../../../../lib/crm';
import { findCustomersByContactDetails } from '../../../../../lib/plenty';
import type { Customer } from '../../../../../lib/types';
import { getStaffUser } from '../../../../staff-auth';

function normalizedEmail(value: string) {
  return value.trim().toLocaleLowerCase('de');
}

function hasCustomerName(customer: Customer) {
  return Boolean(customer.company || customer.firstName || customer.lastName || customer.fullName);
}

function exactCustomerMatch(lead: CrmLeadRow, customers: Customer[]) {
  const email = normalizedEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  return customers
    .map((customer) => ({
      customer,
      score: (email && normalizedEmail(customer.email) === email ? 2 : 0)
        + (phone && normalizePhone(customer.phone) === phone ? 1 : 0),
    }))
    .filter((entry) => entry.score > 0 && hasCustomerName(entry.customer))
    .sort((left, right) => right.score - left.score)[0]?.customer ?? null;
}

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  await ensureDatabase();

  try {
    const body = await request.json().catch(() => ({})) as { apply?: boolean };
    const apply = body.apply === true;
    const rows = await env.DB.prepare(`SELECT * FROM crm_leads
      WHERE company = '' AND first_name = '' AND last_name = '' AND (
        status <> 'Gelöscht' OR EXISTS (
          SELECT 1 FROM crm_lead_events event
          WHERE event.lead_id = crm_leads.id AND event.channel = 'Plenty'
            AND event.note = 'Kein Plenty-Kontakt über E-Mail oder Telefonnummer gefunden; aus der aktiven Liste ausgeblendet.'
        )
      )
      ORDER BY last_contact_at DESC LIMIT 500`).all<CrmLeadRow>();
    const leads = rows.results ?? [];
    const result = { candidates: leads.length, matched: 0, hidden: 0, failed: 0, applied: apply, errors: [] as string[] };

    const inspected: Array<{ lead: CrmLeadRow; match: Customer | null; error?: string }> = [];
    for (let start = 0; start < leads.length; start += 4) {
      inspected.push(...await Promise.all(leads.slice(start, start + 4).map(async (lead) => {
        try {
          const customers = await findCustomersByContactDetails(env, lead.email, lead.phone);
          return { lead, match: exactCustomerMatch(lead, customers) };
        } catch (error) {
          return { lead, match: null, error: error instanceof Error ? error.message : 'Abgleich fehlgeschlagen.' };
        }
      })));
    }

    for (const inspectedLead of inspected) {
      const { lead, match } = inspectedLead;
      if (inspectedLead.error) {
        result.failed += 1;
        if (result.errors.length < 10) result.errors.push(inspectedLead.error);
        continue;
      }
      try {
        if (match) {
          result.matched += 1;
          if (!apply) continue;
          const now = new Date().toISOString();
          const status = lead.status === 'Unvollständige Kontaktdaten' || lead.status === 'Gelöscht' ? 'Neu' : lead.status;
          await env.DB.batch([
            env.DB.prepare(`UPDATE crm_leads SET
              company = ?, first_name = ?, last_name = ?,
              email = ?, email_normalized = ?, phone = ?, phone_normalized = ?, name_normalized = ?,
              street = ?, house_number = ?, zip = ?, city = ?, status = ?,
              plenty_contact_id = ?, plenty_address_id = COALESCE(?, plenty_address_id), updated_at = ?
              WHERE id = ?`)
              .bind(
                match.company, match.firstName, match.lastName,
                lead.email || match.email, normalizedEmail(lead.email || match.email), lead.phone || match.phone,
                normalizePhone(lead.phone || match.phone), normalizeLeadName(match.firstName, match.lastName, match.company),
                lead.street || match.street, lead.house_number || match.houseNumber, lead.zip || match.zip, lead.city || match.city,
                status, match.id, match.billingAddressId ?? null, now, lead.id,
              ),
            env.DB.prepare(`INSERT INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .bind(crypto.randomUUID(), lead.id, now, 'Plenty', `Automatisch mit Plenty-Kontakt ${match.id} abgeglichen.`, user.displayName, now),
          ]);
        } else {
          result.hidden += 1;
          if (!apply) continue;
          if (lead.status === 'Gelöscht') continue;
          const now = new Date().toISOString();
          await env.DB.batch([
            env.DB.prepare("UPDATE crm_leads SET status = 'Gelöscht', updated_at = ? WHERE id = ?").bind(now, lead.id),
            env.DB.prepare(`INSERT INTO crm_lead_events (id, lead_id, occurred_at, channel, note, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .bind(crypto.randomUUID(), lead.id, now, 'Plenty', 'Kein Plenty-Kontakt über E-Mail oder Telefonnummer gefunden; aus der aktiven Liste ausgeblendet.', user.displayName, now),
          ]);
        }
      } catch (error) {
        result.failed += 1;
        if (result.errors.length < 10) result.errors.push(error instanceof Error ? error.message : 'Abgleich fehlgeschlagen.');
      }
    }

    return NextResponse.json(result, { status: result.failed === result.candidates && result.candidates > 0 ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Plenty-Abgleich fehlgeschlagen.' }, { status: 502 });
  }
}
