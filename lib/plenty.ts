import type { ArticleMatch, Customer, NewCustomerInput, OrderAddress, PlentyOrderPosition } from './types';

type PlentyEnv = Pick<Cloudflare.Env, 'PLENTY_BASE_URL' | 'PLENTY_USERNAME' | 'PLENTY_PASSWORD'>;

let tokenCache: { token: string; expiresAt: number } | null = null;
let articleCache: { entries: ArticleMatch[]; expiresAt: number } | null = null;
let customerCache: { entries: Customer[]; expiresAt: number } | null = null;
let customerCachePromise: Promise<Customer[]> | null = null;

const KNOWN_ARTICLES: Array<ArticleMatch & { aliases: string[] }> = [
  {
    itemId: '1109616', variationId: '9624', title: 'Anfahrtspauschale 15 km',
    variationName: 'Anfahrtspauschale 15 km', model: '', isActive: true,
    aliases: ['Anfahrtspauschale 15 km', 'Anfahrt 15 km'],
  },
  {
    itemId: '1109616', variationId: '9625', title: 'Anfahrtspauschale 30 km',
    variationName: 'Anfahrtspauschale 30 km', model: '', isActive: true,
    aliases: ['Anfahrtspauschale 30 km', 'Anfahrt 30 km'],
  },
  {
    itemId: '1109616', variationId: '9626', title: 'Anfahrtspauschale 50 km',
    variationName: 'Anfahrtspauschale 50 km', model: '', isActive: true,
    aliases: ['Anfahrtspauschale 50 km', 'Anfahrt 50 km'],
  },
];

function required(value: string | undefined, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} ist noch nicht eingerichtet.`);
  return normalized;
}

async function getToken(runtime: PlentyEnv): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const username = required(runtime.PLENTY_USERNAME, 'PLENTY_USERNAME');
  const password = required(runtime.PLENTY_PASSWORD, 'PLENTY_PASSWORD');
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) throw new Error(`Plenty-Anmeldung fehlgeschlagen (HTTP ${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  const token = String(data.accessToken ?? data.token ?? data.bearerToken ?? data.access_token ?? '');
  if (!token) throw new Error('Plenty hat kein Zugriffstoken zurückgegeben.');
  tokenCache = { token, expiresAt: Date.now() + 9 * 60 * 1000 };
  return token;
}

function optionValue(options: unknown, typeIds: number[]): string {
  if (!Array.isArray(options)) return '';
  const item = options.find((option) => {
    if (!option || typeof option !== 'object') return false;
    const row = option as Record<string, unknown>;
    return typeIds.includes(Number(row.typeId)) && row.value;
  }) as Record<string, unknown> | undefined;
  return String(item?.value ?? '').trim();
}

function addressRows(addresses: unknown): Array<{ relation: Record<string, unknown>; address: Record<string, unknown> }> {
  if (!Array.isArray(addresses)) return [];
  return addresses.map((entry) => {
    if (!entry || typeof entry !== 'object') return { relation: {}, address: {} };
    const row = entry as Record<string, unknown>;
    return {
      relation: row,
      address: row.address && typeof row.address === 'object' ? row.address as Record<string, unknown> : row,
    };
  });
}

function relationValue(row: { relation: Record<string, unknown>; address: Record<string, unknown> }, key: string) {
  const pivot = row.relation.pivot && typeof row.relation.pivot === 'object' ? row.relation.pivot as Record<string, unknown> : {};
  return row.relation[key] ?? pivot[key] ?? row.address[key];
}

function bestAddress(addresses: unknown, typeId = 1): Record<string, unknown> {
  const rows = addressRows(addresses);
  const typed = rows.filter((row) => Number(relationValue(row, 'typeId') ?? relationValue(row, 'addressTypeId')) === typeId);
  const candidates = typed.length ? typed : rows;
  const selected = candidates.find((row) => {
    const value = relationValue(row, 'isPrimary');
    return value === true || Number(value) === 1;
  }) ?? candidates[0];
  return selected?.address ?? {};
}

function mapCustomer(input: unknown): Customer {
  const contact = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const address = bestAddress(contact.addresses, 1);
  const deliveryAddress = bestAddress(contact.addresses, 2);
  const accounts = Array.isArray(contact.accounts) ? contact.accounts as Array<Record<string, unknown>> : [];
  const firstName = String(contact.firstName ?? '').trim();
  const lastName = String(contact.lastName ?? '').trim();
  const company = String(address.name1 ?? accounts[0]?.companyName ?? accounts[0]?.name ?? '').trim();
  const email = String(contact.email ?? optionValue(contact.options, [2]) ?? optionValue(address.options, [5, 2])).trim();
  const phone = String(contact.privatePhone ?? contact.phone ?? contact.mobile ?? contact.mobilePhone ?? optionValue(contact.options, [1]) ?? optionValue(address.options, [4, 1])).trim();

  return {
    id: String(contact.id ?? ''),
    number: String(contact.number ?? ''),
    company,
    firstName,
    lastName,
    fullName: String(contact.fullName ?? [firstName, lastName].filter(Boolean).join(' ')).trim(),
    email,
    phone,
    street: String(address.address1 ?? '').trim(),
    houseNumber: String(address.address2 ?? '').trim(),
    zip: String(address.postalCode ?? '').trim(),
    city: String(address.town ?? '').trim(),
    gender: String(contact.gender ?? address.gender ?? '').trim(),
    formOfAddress: String(contact.formOfAddress ?? '').trim(),
    title: String(contact.title ?? '').trim(),
    plentyId: Number(contact.plentyId) || undefined,
    billingAddressId: String(address.id ?? '').trim() || undefined,
    deliveryAddressId: String(deliveryAddress.id ?? '').trim() || undefined,
  };
}

export async function getCustomer(runtime: PlentyEnv, contactId: string): Promise<Customer> {
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const response = await fetch(`${baseUrl}/accounts/contacts/${encodeURIComponent(contactId)}?with=options,accounts,addresses`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Plenty-Kundendaten konnten nicht geladen werden (HTTP ${response.status}).`);
  return mapCustomer(await response.json());
}

export async function searchCustomers(runtime: PlentyEnv, query: string): Promise<Customer[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const url = new URL(`${baseUrl}/accounts/contacts`);
  url.searchParams.set('page', '1');
  url.searchParams.set('itemsPerPage', '100');
  url.searchParams.set('fullText', normalized);
  url.searchParams.set('with', 'options,accounts,addresses');

  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Plenty-Kundensuche fehlgeschlagen (HTTP ${response.status}).`);
  const payload = (await response.json()) as unknown;
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).entries)
      ? (payload as { entries: unknown[] }).entries
      : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).data)
        ? (payload as { data: unknown[] }).data
        : [];
  return rows.map(mapCustomer).slice(0, 12);
}

function contactEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.entries)) return row.entries;
  if (Array.isArray(row.data)) return row.data;
  return [];
}

async function loadCustomerCatalog(runtime: PlentyEnv): Promise<Customer[]> {
  if (customerCache && customerCache.expiresAt > Date.now()) return customerCache.entries;
  if (customerCachePromise) return customerCachePromise;
  customerCachePromise = (async () => {
    const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
    const token = await getToken(runtime);
    const pageSize = 100;
    const loadPage = async (page: number) => {
      const url = new URL(`${baseUrl}/accounts/contacts`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('itemsPerPage', String(pageSize));
      url.searchParams.set('with', 'options,accounts,addresses');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
        if (response.ok) return response.json() as Promise<Record<string, unknown>>;
        if (response.status !== 429 || attempt === 3) throw new Error(`Plenty-Kundenstamm konnte nicht geladen werden (HTTP ${response.status}).`);
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
      }
      throw new Error('Plenty-Kundenstamm konnte nicht geladen werden.');
    };
    const first = await loadPage(1);
    const total = Number(first.totalsCount ?? first.totalCount ?? 0);
    const lastPage = Math.max(1, Math.min(Number(first.lastPageNumber ?? first.lastPage) || Math.ceil(total / pageSize) || 1, 100));
    const pages: Record<string, unknown>[] = [first];
    for (let start = 2; start <= lastPage; start += 2) {
      const batch = Array.from({ length: Math.min(2, lastPage - start + 1) }, (_, offset) => loadPage(start + offset));
      pages.push(...await Promise.all(batch));
    }
    const entries = pages.flatMap(contactEntries).map(mapCustomer);
    customerCache = { entries, expiresAt: Date.now() + 5 * 60 * 1000 };
    return entries;
  })();
  try {
    return await customerCachePromise;
  } finally {
    customerCachePromise = null;
  }
}

export async function findCustomersByContactDetails(runtime: PlentyEnv, email: string, phone: string): Promise<Customer[]> {
  const wantedEmail = email.trim().toLocaleLowerCase('de');
  const wantedPhone = phone.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '49');
  if (!wantedEmail && !wantedPhone) return [];
  const catalog = await loadCustomerCatalog(runtime);
  return catalog.filter((customer) => {
    const customerEmail = customer.email.trim().toLocaleLowerCase('de');
    const customerPhone = customer.phone.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '49');
    return Boolean((wantedEmail && customerEmail === wantedEmail) || (wantedPhone && customerPhone === wantedPhone));
  });
}

function normalize(value: string) {
  return value.toLocaleLowerCase('de').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();
}

function variationEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.entries)) return row.entries;
  if (Array.isArray(row.data)) return row.data;
  if (Array.isArray(row.variations)) return row.variations;
  return [];
}

function translatedName(value: unknown): string {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];
  const rows = entries.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
  const preferred = rows.find((row) => String(row.lang ?? row.language ?? '').toLocaleLowerCase('de').startsWith('de')) ?? rows[0];
  return String(preferred?.name ?? preferred?.name1 ?? preferred?.title ?? '').trim();
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) ?? '';
}

function mapArticle(input: unknown): ArticleMatch | null {
  const variation = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const item = variation.item && typeof variation.item === 'object' ? variation.item as Record<string, unknown> : {};
  const variationId = String(variation.id ?? variation.variationId ?? '');
  const itemId = String(variation.itemId ?? item.id ?? '');
  if (!variationId || !itemId) return null;
  const salesPrices = variation.variationSalesPrices ?? variation.salesPrices;
  const priceRows = (Array.isArray(salesPrices) ? salesPrices : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => {
      const config = entry.salesPrice && typeof entry.salesPrice === 'object' ? entry.salesPrice as Record<string, unknown> : {};
      const price = Number(entry.price ?? entry.value);
      const currencies = Array.isArray(config.currencies) ? config.currencies as Array<Record<string, unknown>> : [];
      return {
        price,
        salesPriceId: String(entry.salesPriceId ?? config.id ?? ''),
        currency: String(entry.currency ?? currencies[0]?.currency ?? currencies[0]?.name ?? 'EUR'),
        preferred: config.isDisplayedByDefault === true || config.type === 'default',
      };
    })
    .filter((entry) => Number.isFinite(entry.price));
  const selectedPrice = priceRows.find((entry) => entry.preferred && entry.price > 0)
    ?? priceRows.find((entry) => entry.price > 0)
    ?? priceRows[0];
  return {
    variationId,
    itemId,
    title: firstText(item.name, item.backendName, item.externalName, translatedName(item.texts ?? item.itemTexts ?? variation.itemTexts), variation.name, variation.model),
    variationName: firstText(variation.name, translatedName(variation.names ?? variation.variationNames)),
    model: String(variation.model ?? variation.customNumber ?? variation.number ?? '').trim(),
    isActive: variation.isActive !== false && Number(variation.isActive) !== 0,
    priceGross: selectedPrice?.price,
    currency: selectedPrice?.currency || 'EUR',
    salesPriceId: selectedPrice?.salesPriceId,
  };
}

async function loadArticleCatalog(runtime: PlentyEnv): Promise<ArticleMatch[]> {
  if (articleCache && articleCache.expiresAt > Date.now()) return articleCache.entries;
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const loadPage = async (page: number) => {
    const url = new URL(`${baseUrl}/items/variations`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('itemsPerPage', '250');
    url.searchParams.set('isActive', 'true');
    url.searchParams.set('with', 'item,variationSalesPrices');
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    if (!response.ok) throw new Error(`Plenty-Artikelkatalog konnte nicht geladen werden (HTTP ${response.status}).`);
    return response.json() as Promise<Record<string, unknown>>;
  };
  const first = await loadPage(1);
  const total = Number(first.lastPageNumber ?? first.lastPage ?? Math.ceil(Number(first.totalsCount ?? first.totalCount ?? 0) / 250) ?? 1);
  const lastPage = Math.max(1, Math.min(total || 1, 80));
  const pages: Record<string, unknown>[] = [first];
  for (let start = 2; start <= lastPage; start += 8) {
    const batch = Array.from({ length: Math.min(8, lastPage - start + 1) }, (_, offset) => loadPage(start + offset));
    pages.push(...await Promise.all(batch));
  }
  const entries = pages.flatMap(variationEntries).map(mapArticle).filter((entry): entry is ArticleMatch => Boolean(entry));
  articleCache = { entries, expiresAt: Date.now() + 5 * 60 * 1000 };
  return entries;
}

function descriptionTitle(payload: unknown) {
  const entries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).entries)
      ? (payload as { entries: unknown[] }).entries
      : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).data)
        ? (payload as { data: unknown[] }).data
        : payload && typeof payload === 'object' ? [payload] : [];
  const rows = entries.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
  const german = rows.find((row) => String(row.lang ?? row.language ?? '').toLocaleLowerCase('de').startsWith('de')) ?? rows[0];
  return firstText(german?.name, german?.name1, german?.title);
}

async function enrichArticleTitles(runtime: PlentyEnv, entries: ArticleMatch[]) {
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  return Promise.all(entries.map(async (entry) => {
    try {
      const response = await fetch(`${baseUrl}/items/${encodeURIComponent(entry.itemId)}/variations/${encodeURIComponent(entry.variationId)}/descriptions`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
      if (!response.ok) return entry;
      const title = descriptionTitle(await response.json());
      return title ? { ...entry, title } : entry;
    } catch {
      return entry;
    }
  }));
}

export async function searchArticles(runtime: PlentyEnv, query: string): Promise<ArticleMatch[]> {
  const wanted = normalize(query);
  if (wanted.length < 2) return [];

  const known = KNOWN_ARTICLES.filter((entry) => {
    if (wanted === 'anfahrt' || wanted === 'anfahrtspauschale') return true;
    return entry.aliases.some((alias) => normalize(alias) === wanted);
  });
  if (known.length) {
    try {
      const hydrated = await findArticlesByVariationIds(runtime, known.map((entry) => entry.variationId));
      return known.map(({ aliases, ...entry }) => {
        void aliases;
        return hydrated.get(entry.variationId) ?? entry;
      });
    } catch {
      return known.map(({ aliases, ...entry }) => {
        void aliases;
        return entry;
      });
    }
  }

  const catalog = await loadArticleCatalog(runtime);
  const rawTokens = wanted.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  const genericTokens = new Set(['artikel', 'material', 'kaeltemittel', 'anfahrt', 'anfahrtspauschale', 'pauschale', 'strecke', 'noch', 'berechnen', 'km']);
  const specificTokens = rawTokens.filter((token) => !genericTokens.has(token));
  const tokens = specificTokens.length ? specificTokens : rawTokens;

  const matches = catalog
    .map((entry) => {
      const fields = [entry.title, entry.variationName, entry.model, entry.itemId, entry.variationId].map(normalize);
      let score = 0;
      for (const field of fields) {
        if (field === wanted) score = Math.max(score, 100);
        else if (field.startsWith(wanted)) score = Math.max(score, 85);
        else if (field.includes(wanted)) score = Math.max(score, 70);
      }

      if (!score && tokens.length) {
        let tokenScore = 0;
        let allTokensMatch = true;
        for (const token of tokens) {
          const exact = fields.some((field) => field === token);
          const starts = fields.some((field) => field.startsWith(token));
          const includes = fields.some((field) => field.includes(token));
          if (!includes) {
            allTokensMatch = false;
            break;
          }
          tokenScore += exact ? 50 : starts ? 40 : 30;
        }
        if (allTokensMatch) score = tokenScore;
      }
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 40)
    .map((row) => row.entry);
  return enrichArticleTitles(runtime, matches);
}

export async function findArticlesByVariationIds(runtime: PlentyEnv, variationIds: string[]): Promise<Map<string, ArticleMatch>> {
  const ids = [...new Set(variationIds.map((value) => value.trim()).filter(Boolean))];
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const direct = await Promise.all(ids.map(async (variationId) => {
    try {
      const response = await fetch(`${baseUrl}/items/variations/${encodeURIComponent(variationId)}?with=item,variationSalesPrices`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
      if (!response.ok) return null;
      return mapArticle(await response.json());
    } catch {
      return null;
    }
  }));
  const found = direct.filter((entry): entry is ArticleMatch => Boolean(entry));
  const missing = ids.filter((id) => !found.some((entry) => entry.variationId === id));
  if (missing.length) {
    const catalog = await loadArticleCatalog(runtime);
    found.push(...catalog.filter((entry) => missing.includes(entry.variationId)));
  }
  const enriched = await enrichArticleTitles(runtime, found);
  return new Map(enriched.map((entry) => [entry.variationId, entry]));
}

type PlentyOrderInput = {
  customerId: string;
  customerPlentyId?: number;
  customerReference: string;
  billingAddress: OrderAddress;
  deliverySameAsBilling: boolean;
  deliveryAddress: OrderAddress;
  positions: PlentyOrderPosition[];
};

type PlentyOrderResult = {
  orderId: string;
  billingAddressId: string;
  deliveryAddressId: string;
};

function payloadEntries(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.entries)) return payloadEntries(row.entries);
  if (Array.isArray(row.data)) return payloadEntries(row.data);
  return [row];
}

async function plentyJson(runtime: PlentyEnv, path: string, init?: RequestInit) {
  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  return { response, payload };
}

async function createContactAddress(runtime: PlentyEnv, customerId: string, address: OrderAddress, typeId: 1 | 2) {
  const { response, payload } = await plentyJson(runtime, '/accounts/addresses', {
    method: 'POST',
    body: JSON.stringify({
      name1: address.company.trim(),
      name2: address.firstName.trim(),
      name3: address.lastName.trim(),
      address1: address.street.trim(),
      address2: address.houseNumber.trim(),
      postalCode: address.zip.trim(),
      town: address.city.trim(),
      countryId: address.countryId || 1,
      contactRelations: [{ contactId: Number(customerId), typeId, isPrimary: false }],
    }),
  });
  if (!response.ok) throw new Error(`Die ${typeId === 1 ? 'Rechnungs' : 'Liefer'}adresse konnte in Plenty nicht angelegt werden (HTTP ${response.status}).`);
  const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const id = String(row.id ?? (row.data as Record<string, unknown> | undefined)?.id ?? '');
  if (!id) throw new Error('Plenty hat für die neue Adresse keine ID zurückgegeben.');
  return id;
}

function numberFrom(row: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export async function createPlentyOrder(runtime: PlentyEnv, input: PlentyOrderInput): Promise<PlentyOrderResult> {
  const customer = await getCustomer(runtime, input.customerId);
  const plentyId = input.customerPlentyId || customer.plentyId || 0;

  const [webstoreResponse, recentOrderResponse] = await Promise.all([
    plentyJson(runtime, '/webstores'),
    plentyJson(runtime, '/orders?itemsPerPage=20&page=1&typeId=1'),
  ]);
  const webstores = webstoreResponse.response.ok ? payloadEntries(webstoreResponse.payload) : [];
  const recentOrders = recentOrderResponse.response.ok ? payloadEntries(recentOrderResponse.payload) : [];
  const webstore = webstores.find((row) => numberFrom(row, 'storeIdentifier', 'plentyId') === plentyId)
    ?? webstores.find((row) => Number(row.id) === 0)
    ?? webstores[0];
  const configuration = webstore?.configuration && typeof webstore.configuration === 'object'
    ? webstore.configuration as Record<string, unknown>
    : undefined;
  const recentOrder = recentOrders.find((row) => Number(row.plentyId) === plentyId) ?? recentOrders[0];
  const resolvedPlentyId = plentyId
    || numberFrom(webstore, 'storeIdentifier', 'plentyId')
    || numberFrom(recentOrder, 'plentyId');
  const locationId = numberFrom(configuration, 'defaultAccountingLocation', 'locationId')
    || numberFrom(recentOrder, 'locationId');
  if (!locationId || !resolvedPlentyId) throw new Error('Mandant und Buchhaltungsstandort konnten in Plenty nicht automatisch ermittelt werden.');

  const vatResponses = await Promise.all([
    plentyJson(runtime, `/vat/locations/${locationId}/countries/1`),
    plentyJson(runtime, `/vat/locations/${locationId}`),
  ]);
  const vats = vatResponses.flatMap((entry) => entry.response.ok ? payloadEntries(entry.payload) : []);
  const vat = vats.find((row) => row.isActive === true && Number(row.countryId) === 1)
    ?? vats.find((row) => row.isStandard === true && Number(row.countryId) === 1)
    ?? vats.find((row) => Number(row.countryId) === 1)
    ?? vats[0];
  const recentOrderItems = payloadEntries(recentOrder?.orderItems);
  const recentOrderItem = recentOrderItems.find((row) => numberFrom(row, 'countryVatId')) ?? recentOrderItems[0];
  const countryVatId = numberFrom(vat, 'id', 'countryVatId') || numberFrom(recentOrderItem, 'countryVatId');
  const vatRates = payloadEntries(vat?.vatRates);
  const standardVat = vatRates.find((row) => Number(row.vatField ?? row.field ?? row.id) === 0) ?? vatRates[0];
  const vatRate = numberFrom(standardVat, 'vatRate', 'rate', 'value') || numberFrom(recentOrderItem, 'vatRate') || 19;
  if (!countryVatId) throw new Error('Die deutsche Umsatzsteuer-Konfiguration konnte in Plenty nicht ermittelt werden.');

  const [warehouseResponse, shippingResponse] = await Promise.all([
    plentyJson(runtime, '/stockmanagement/warehouses'),
    plentyJson(runtime, '/orders/shipping/presets'),
  ]);
  const warehouses = warehouseResponse.response.ok ? payloadEntries(warehouseResponse.payload) : [];
  const shippingProfiles = shippingResponse.response.ok ? payloadEntries(shippingResponse.payload) : [];
  const warehouse = warehouses.find((row) => row.isActive !== false) ?? warehouses[0];
  const shippingProfile = shippingProfiles.find((row) => row.isDefault === true || row.isDefaultShippingProfile === true)
    ?? shippingProfiles.find((row) => row.isActive !== false)
    ?? shippingProfiles[0];
  const warehouseId = numberFrom(warehouse, 'id', 'warehouseId') || 1;
  const shippingProfileId = numberFrom(shippingProfile, 'id', 'profileId', 'shippingProfileId') || 1;

  const billingAddressId = input.billingAddress.addressId || customer.billingAddressId
    || await createContactAddress(runtime, input.customerId, input.billingAddress, 1);
  const deliveryAddressId = input.deliverySameAsBilling
    ? billingAddressId
    : input.deliveryAddress.addressId || await createContactAddress(runtime, input.customerId, input.deliveryAddress, 2);

  const orderBody = {
    typeId: 1,
    statusId: 3,
    referrerId: 1,
    plentyId: resolvedPlentyId,
    locationId,
    relations: [
      { referenceType: 'warehouse', referenceId: warehouseId, relation: 'sender' },
      { referenceType: 'contact', referenceId: Number(input.customerId), relation: 'receiver' },
    ],
    addressRelations: [
      { typeId: 1, addressId: Number(billingAddressId) },
      { typeId: 2, addressId: Number(deliveryAddressId) },
    ],
    properties: [
      { typeId: 1, value: String(warehouseId) },
      { typeId: 2, value: String(shippingProfileId) },
      { typeId: 6, value: 'de' },
      { typeId: 8, value: input.customerReference.trim() },
    ],
    orderItems: input.positions.map((position, index) => ({
      typeId: 1,
      quantity: position.quantity,
      orderItemName: position.title,
      itemVariationId: Number(position.variationId),
      countryVatId,
      vatField: 0,
      vatRate,
      referrerId: 1,
      position: index,
      warehouseId,
      shippingProfileId,
      properties: [
        { typeId: 1, value: String(warehouseId) },
        { typeId: 2, value: String(shippingProfileId) },
      ],
      amounts: [{
        isSystemCurrency: true,
        currency: position.currency || 'EUR',
        exchangeRate: 1,
        priceOriginalGross: Number(position.priceGross),
      }],
    })),
  };
  const { response, payload } = await plentyJson(runtime, '/orders', { method: 'POST', body: JSON.stringify(orderBody) });
  if (!response.ok) {
    const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const detail = String(row.message ?? row.error ?? '').trim();
    throw new Error(`Plenty konnte den Auftrag nicht anlegen (HTTP ${response.status})${detail ? `: ${detail.slice(0, 300)}` : '.'}`);
  }
  const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const orderId = String(row.id ?? row.orderId ?? (row.data as Record<string, unknown> | undefined)?.id ?? '');
  if (!orderId) throw new Error('Plenty hat keine Auftrags-ID zurückgegeben.');
  return { orderId, billingAddressId, deliveryAddressId };
}

function validateNewCustomer(input: NewCustomerInput) {
  if (!input.company.trim() && (!input.firstName.trim() || !input.lastName.trim())) throw new Error('Bitte Firma oder Vor- und Nachname angeben.');
  if (!input.street.trim() || !input.houseNumber.trim() || !input.zip.trim() || !input.city.trim()) throw new Error('Bitte die vollständige Anschrift angeben.');
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');
}

export async function createCustomer(runtime: PlentyEnv, input: NewCustomerInput, force = false): Promise<{ customer?: Customer; duplicates?: Customer[] }> {
  validateNewCustomer(input);
  const searchTerm = input.company.trim() || `${input.firstName} ${input.lastName}`.trim();
  const possible = await searchCustomers(runtime, searchTerm);
  const wantedEmail = normalize(input.email);
  const wantedAddress = normalize(`${input.street} ${input.houseNumber} ${input.zip} ${input.city}`);
  const duplicates = possible.filter((customer) => {
    const emailMatch = wantedEmail && normalize(customer.email) === wantedEmail;
    const addressMatch = normalize(`${customer.street} ${customer.houseNumber} ${customer.zip} ${customer.city}`) === wantedAddress;
    return emailMatch || addressMatch;
  });
  if (duplicates.length && !force) return { duplicates };

  const baseUrl = required(runtime.PLENTY_BASE_URL, 'PLENTY_BASE_URL').replace(/\/$/, '');
  const token = await getToken(runtime);
  const contactResponse = await fetch(`${baseUrl}/accounts/contacts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      typeId: 1,
      referrerId: 1,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      fullName: `${input.firstName} ${input.lastName}`.trim(),
      email: input.email.trim(),
      privatePhone: input.phone.trim(),
      options: [
        { typeId: 2, subTypeId: 4, value: input.email.trim(), priority: 0 },
        ...(input.phone.trim() ? [{ typeId: 1, subTypeId: 4, value: input.phone.trim(), priority: 0 }] : []),
      ],
    }),
  });
  if (!contactResponse.ok) throw new Error(`Plenty konnte den Kontakt nicht anlegen (HTTP ${contactResponse.status}).`);
  const contactData = await contactResponse.json() as Record<string, unknown>;
  const contactId = String(contactData.id ?? contactData.contactId ?? (contactData.data as Record<string, unknown> | undefined)?.id ?? '');
  if (!contactId) throw new Error('Plenty hat keine Kontakt-ID zurückgegeben.');

  const addressResponse = await fetch(`${baseUrl}/accounts/addresses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      name1: input.company.trim(), name2: input.firstName.trim(), name3: input.lastName.trim(),
      address1: input.street.trim(), address2: input.houseNumber.trim(), postalCode: input.zip.trim(), town: input.city.trim(), countryId: 1,
      options: [
        { typeId: 5, subTypeId: 4, value: input.email.trim(), priority: 0 },
        ...(input.phone.trim() ? [{ typeId: 4, subTypeId: 4, value: input.phone.trim(), priority: 0 }] : []),
      ],
      contactRelations: [
        { contactId: Number(contactId), typeId: 1, isPrimary: true },
        { contactId: Number(contactId), typeId: 2, isPrimary: true },
      ],
    }),
  });
  if (!addressResponse.ok) throw new Error(`Der Kontakt wurde angelegt, aber die Adresse konnte nicht gespeichert werden (HTTP ${addressResponse.status}, Kontakt ${contactId}).`);
  const readResponse = await fetch(`${baseUrl}/accounts/contacts/${encodeURIComponent(contactId)}?with=options,accounts,addresses`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (readResponse.ok) return { customer: mapCustomer(await readResponse.json()) };
  return { customer: { id: contactId, number: '', company: input.company.trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), fullName: `${input.firstName} ${input.lastName}`.trim(), email: input.email.trim(), phone: input.phone.trim(), street: input.street.trim(), houseNumber: input.houseNumber.trim(), zip: input.zip.trim(), city: input.city.trim() } };
}
