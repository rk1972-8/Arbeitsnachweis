import type { ArticleMatch, Customer, NewCustomerInput } from './types';

type PlentyEnv = Pick<Cloudflare.Env, 'PLENTY_BASE_URL' | 'PLENTY_USERNAME' | 'PLENTY_PASSWORD'>;

let tokenCache: { token: string; expiresAt: number } | null = null;
let articleCache: { entries: ArticleMatch[]; expiresAt: number } | null = null;

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

function bestAddress(addresses: unknown): Record<string, unknown> {
  if (!Array.isArray(addresses)) return {};
  const rows = addresses.map((entry) => {
    if (!entry || typeof entry !== 'object') return {};
    const row = entry as Record<string, unknown>;
    return row.address && typeof row.address === 'object' ? row.address as Record<string, unknown> : row;
  });
  return rows.find((row) => {
    const pivot = row.pivot && typeof row.pivot === 'object' ? row.pivot as Record<string, unknown> : {};
    return row.isPrimary === true || Number(row.isPrimary) === 1 || pivot.isPrimary === true || Number(pivot.isPrimary) === 1;
  }) ?? rows[0] ?? {};
}

function mapCustomer(input: unknown): Customer {
  const contact = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const address = bestAddress(contact.addresses);
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
  };
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
  return {
    variationId,
    itemId,
    title: firstText(item.name, item.backendName, item.externalName, translatedName(item.texts ?? item.itemTexts ?? variation.itemTexts), variation.name, variation.model),
    variationName: firstText(variation.name, translatedName(variation.names ?? variation.variationNames)),
    model: String(variation.model ?? variation.customNumber ?? variation.number ?? '').trim(),
    isActive: variation.isActive !== false && Number(variation.isActive) !== 0,
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
    url.searchParams.set('with', 'item');
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
  if (known.length) return known.map(({ aliases: _aliases, ...entry }) => entry);

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
