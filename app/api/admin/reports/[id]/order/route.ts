import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../../../../db/ensure';
import { createPlentyOrder, findArticlesByVariationIds, getCustomer } from '../../../../../../lib/plenty';
import type { ArticleMatch, OrderAddress, PlentyOrderDraft, PlentyOrderPosition, PositionRow } from '../../../../../../lib/types';
import { getStaffUser } from '../../../../../staff-auth';

type ReportRow = {
  id: string;
  report_number: string;
  customer_id: string;
  customer_company: string;
  customer_name: string;
  customer_address: string;
  work_address: string;
  work_description: string;
  findings: string;
  complaints: string;
  positions_json: string;
};

type DraftRow = {
  status: 'draft' | 'created';
  customer_reference: string;
  billing_address_json: string;
  delivery_same_as_billing: number;
  delivery_address_json: string;
  positions_json: string;
  plenty_order_id: string | null;
};

type AdditionRow = {
  id: string;
  quantity: number;
  unit: string;
  title: string;
  item_id: string | null;
  variation_id: string | null;
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function splitAddress(value: string): Partial<OrderAddress> {
  const [streetPart = '', cityPart = ''] = value.split(',').map((part) => part.trim());
  const streetMatch = streetPart.match(/^(.*?)(?:\s+([0-9]+\s*[a-zA-Z]?))?$/);
  const cityMatch = cityPart.match(/^(\d{5})\s+(.+)$/);
  return {
    street: streetMatch?.[1]?.trim() || streetPart,
    houseNumber: streetMatch?.[2]?.trim() || '',
    zip: cityMatch?.[1] || '',
    city: cityMatch?.[2]?.trim() || cityPart,
  };
}

function customerAddress(customer: Awaited<ReturnType<typeof getCustomer>>): OrderAddress {
  return {
    company: customer.company,
    firstName: customer.firstName,
    lastName: customer.lastName,
    street: customer.street,
    houseNumber: customer.houseNumber,
    zip: customer.zip,
    city: customer.city,
    countryId: 1,
    addressId: customer.billingAddressId,
  };
}

function referenceFor(report: ReportRow) {
  const text = `${report.complaints} ${report.findings} ${report.work_description}`;
  const match = text.match(/\b(Störung|Wartung|Reparatur|Installation|Montage|Serviceeinsatz)\b/i);
  const kind = match ? match[1][0].toLocaleUpperCase('de') + match[1].slice(1).toLocaleLowerCase('de') : 'Serviceeinsatz';
  return `${kind} · ${report.report_number}`;
}

function validateAddress(address: OrderAddress, label: string) {
  if (!address.street.trim() || !address.houseNumber.trim() || !address.zip.trim() || !address.city.trim()) {
    throw new Error(`${label} ist nicht vollständig.`);
  }
}

function validateDraft(draft: PlentyOrderDraft) {
  if (!draft.customerReference.trim()) throw new Error('Bitte ein Kundenzeichen beziehungsweise einen Bezug angeben.');
  validateAddress(draft.billingAddress, 'Die Rechnungsadresse');
  if (!draft.deliverySameAsBilling) validateAddress(draft.deliveryAddress, 'Die Lieferadresse');
  if (!draft.positions.length) throw new Error('Der Auftrag enthält keine Positionen.');
  const withoutArticle = draft.positions.find((position) => !position.variationId.trim());
  if (withoutArticle) throw new Error(`Für „${withoutArticle.title || 'Unbenannte Position'}“ fehlt ein Plenty-Artikel.`);
  const withoutPrice = draft.positions.find((position) => position.priceGross === null || !Number.isFinite(Number(position.priceGross)) || Number(position.priceGross) < 0);
  if (withoutPrice) throw new Error(`Für „${withoutPrice.title || 'Unbenannte Position'}“ fehlt ein gültiger Preis.`);
}

async function reportById(id: string) {
  return env.DB.prepare(`SELECT id, report_number, customer_id, customer_company, customer_name, customer_address,
    work_address, work_description, findings, complaints, positions_json FROM work_reports WHERE id = ?`)
    .bind(id)
    .first<ReportRow>();
}

async function saveDraft(draft: PlentyOrderDraft) {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO plenty_order_drafts (report_id, status, customer_reference, billing_address_json,
    delivery_same_as_billing, delivery_address_json, positions_json, plenty_order_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET status = excluded.status, customer_reference = excluded.customer_reference,
      billing_address_json = excluded.billing_address_json, delivery_same_as_billing = excluded.delivery_same_as_billing,
      delivery_address_json = excluded.delivery_address_json, positions_json = excluded.positions_json,
      plenty_order_id = COALESCE(plenty_order_drafts.plenty_order_id, excluded.plenty_order_id), updated_at = excluded.updated_at`)
    .bind(
      draft.reportId,
      draft.status,
      draft.customerReference.trim(),
      JSON.stringify(draft.billingAddress),
      draft.deliverySameAsBilling ? 1 : 0,
      JSON.stringify(draft.deliveryAddress),
      JSON.stringify(draft.positions),
      draft.plentyOrderId || null,
      now,
      now,
    )
    .run();
}

async function initialDraft(report: ReportRow): Promise<PlentyOrderDraft> {
  const customer = await getCustomer(env, report.customer_id);
  const billingAddress = customerAddress(customer);
  const deliverySeed = { ...billingAddress, ...splitAddress(report.work_address), addressId: undefined };
  const positions = parseJson<PositionRow[]>(report.positions_json, []);
  const additions = await env.DB.prepare(`SELECT id, quantity, unit, title, item_id, variation_id
    FROM report_additions WHERE report_id = ? ORDER BY created_at`).bind(report.id).all<AdditionRow>();
  const variationIds = [
    ...positions.map((position) => position.variationId || ''),
    ...(additions.results ?? []).map((position) => position.variation_id || ''),
  ];
  let articles = new Map<string, ArticleMatch>();
  try { articles = await findArticlesByVariationIds(env, variationIds); } catch { /* Fehlende Zuordnungen bleiben im Editor sichtbar. */ }
  const orderPositions: PlentyOrderPosition[] = positions.map((position) => {
    const article = position.variationId ? articles.get(position.variationId) : undefined;
    const variant = article?.variationName || article?.model;
    return {
      id: position.id,
      quantity: Number(position.quantity) || 0,
      unit: position.unit,
      title: article ? [article.title, variant && variant !== article.title ? variant : ''].filter(Boolean).join(' · ') : position.name,
      itemId: position.itemId || article?.itemId || '',
      variationId: position.variationId || article?.variationId || '',
      priceGross: article?.priceGross ?? null,
      currency: article?.currency || 'EUR',
      sourceType: position.sourceType,
    };
  });
  for (const addition of additions.results ?? []) {
    const article = addition.variation_id ? articles.get(addition.variation_id) : undefined;
    orderPositions.push({
      id: addition.id,
      quantity: Number(addition.quantity) || 0,
      unit: addition.unit,
      title: addition.title,
      itemId: addition.item_id || article?.itemId || '',
      variationId: addition.variation_id || article?.variationId || '',
      priceGross: article?.priceGross ?? null,
      currency: article?.currency || 'EUR',
      sourceType: 'addition',
    });
  }
  return {
    reportId: report.id,
    reportNumber: report.report_number,
    status: 'draft',
    customerId: report.customer_id,
    customerLabel: report.customer_company || report.customer_name,
    customerReference: referenceFor(report),
    billingAddress,
    deliverySameAsBilling: true,
    deliveryAddress: deliverySeed,
    positions: orderPositions,
  };
}

async function requireAdmin() {
  const user = await getStaffUser();
  return user?.role === 'admin';
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const report = await reportById(id);
    if (!report) return NextResponse.json({ error: 'Arbeitsnachweis nicht gefunden.' }, { status: 404 });
    const stored = await env.DB.prepare(`SELECT status, customer_reference, billing_address_json, delivery_same_as_billing,
      delivery_address_json, positions_json, plenty_order_id FROM plenty_order_drafts WHERE report_id = ?`)
      .bind(id)
      .first<DraftRow>();
    if (stored) {
      const draft: PlentyOrderDraft = {
        reportId: report.id,
        reportNumber: report.report_number,
        status: stored.status,
        customerId: report.customer_id,
        customerLabel: report.customer_company || report.customer_name,
        customerReference: stored.customer_reference,
        billingAddress: parseJson(stored.billing_address_json, {} as OrderAddress),
        deliverySameAsBilling: Boolean(stored.delivery_same_as_billing),
        deliveryAddress: parseJson(stored.delivery_address_json, {} as OrderAddress),
        positions: parseJson(stored.positions_json, [] as PlentyOrderPosition[]),
        plentyOrderId: stored.plenty_order_id || undefined,
      };
      return NextResponse.json({ draft });
    }
    const draft = await initialDraft(report);
    await saveDraft(draft);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Auftragsentwurf konnte nicht geladen werden.' }, { status: 422 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const report = await reportById(id);
    if (!report) return NextResponse.json({ error: 'Arbeitsnachweis nicht gefunden.' }, { status: 404 });
    const input = await request.json() as PlentyOrderDraft;
    const existing = await env.DB.prepare('SELECT status FROM plenty_order_drafts WHERE report_id = ?').bind(id).first<{ status: string }>();
    if (existing?.status === 'created') return NextResponse.json({ error: 'Der Plenty-Auftrag wurde bereits angelegt und kann hier nicht mehr geändert werden.' }, { status: 409 });
    const draft = { ...input, reportId: id, reportNumber: report.report_number, customerId: report.customer_id, customerLabel: report.customer_company || report.customer_name, status: 'draft' as const };
    await saveDraft(draft);
    return NextResponse.json({ saved: true, draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Auftragsentwurf konnte nicht gespeichert werden.' }, { status: 422 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Nur für den Administrator.' }, { status: 403 });
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const report = await reportById(id);
    if (!report) return NextResponse.json({ error: 'Arbeitsnachweis nicht gefunden.' }, { status: 404 });
    const existing = await env.DB.prepare('SELECT status, plenty_order_id FROM plenty_order_drafts WHERE report_id = ?')
      .bind(id).first<{ status: string; plenty_order_id: string | null }>();
    if (existing?.status === 'created') {
      return NextResponse.json({ error: `Der Auftrag wurde bereits als Plenty-Auftrag ${existing.plenty_order_id || ''} angelegt.` }, { status: 409 });
    }
    const input = await request.json() as PlentyOrderDraft;
    const draft: PlentyOrderDraft = { ...input, reportId: id, reportNumber: report.report_number, customerId: report.customer_id, customerLabel: report.customer_company || report.customer_name, status: 'draft' };
    validateDraft(draft);
    await saveDraft(draft);
    const customer = await getCustomer(env, report.customer_id);
    const result = await createPlentyOrder(env, {
      customerId: report.customer_id,
      customerPlentyId: customer.plentyId,
      customerReference: draft.customerReference,
      billingAddress: draft.billingAddress,
      deliverySameAsBilling: draft.deliverySameAsBilling,
      deliveryAddress: draft.deliveryAddress,
      positions: draft.positions,
    });
    const created: PlentyOrderDraft = {
      ...draft,
      status: 'created',
      plentyOrderId: result.orderId,
      billingAddress: { ...draft.billingAddress, addressId: result.billingAddressId },
      deliveryAddress: draft.deliverySameAsBilling
        ? { ...draft.billingAddress, addressId: result.deliveryAddressId }
        : { ...draft.deliveryAddress, addressId: result.deliveryAddressId },
    };
    await saveDraft(created);
    return NextResponse.json({ created: true, orderId: result.orderId, draft: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Plenty-Auftrag konnte nicht angelegt werden.' }, { status: 422 });
  }
}
