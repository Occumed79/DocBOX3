import { acceptSelfPayObservation, provenanceFamilyForSource, type PriceObservationInput, type ProvenanceFamily } from '@/lib/pricing/source-registry';
import { summarizePrices } from '@/lib/pricing/statistics';

type Search = {
  procedureCode: string;
  procedureName: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number | null;
};

export type OpenCashSourceResult = {
  sourceId: string;
  sourceName: string;
  provenanceFamily: ProvenanceFamily;
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
  sourceScope?: string;
  attribution?: string;
  disclaimer?: string;
  dataRefreshed?: string;
  headlineEligible: boolean;
};

function result(
  sourceId: string,
  sourceName: string,
  observations: PriceObservationInput[],
  options: Omit<OpenCashSourceResult, 'sourceId' | 'sourceName' | 'provenanceFamily' | 'observations' | 'summary'>,
): OpenCashSourceResult {
  return {
    sourceId,
    sourceName,
    provenanceFamily: provenanceFamilyForSource(sourceId),
    observations,
    summary: summarizePrices(observations.map((row) => row.price)),
    ...options,
  };
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function norm(value: string | undefined) {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function record(
  sourceId: string,
  search: Search,
  price: number,
  basis: 'cash' | 'discounted_cash' | 'direct_pay' | 'marketplace_cash',
  extra: Partial<PriceObservationInput> = {},
) {
  return acceptSelfPayObservation({
    sourceId,
    procedureCode: search.procedureCode,
    procedureName: search.procedureName,
    price,
    paymentBasis: basis,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// PriceTransparency.io — exact hospital MRF discounted-cash rows.
// For local searches we keep exact-city rows only because the public rate API
// does not expose coordinates. That is intentionally narrower than pretending
// a state-wide row is inside the requested radius.
// ---------------------------------------------------------------------------
async function priceTransparency(search: Search): Promise<OpenCashSourceResult> {
  const params = new URLSearchParams({
    code: search.procedureCode,
    rate_type: 'cash',
    limit: '1000',
  });
  if (search.state) params.set('state', search.state);
  if (/^\d{5}$/.test(search.procedureCode)) params.set('type', 'CPT');
  else if (/^[A-Z]\d{4}$/i.test(search.procedureCode)) params.set('type', 'HCPCS');

  const payload = await fetchJson(`https://pricetransparency.io/api/hpt/rates?${params.toString()}`) as { rows?: unknown[] };
  const wantedCity = norm(search.city);
  const observations: PriceObservationInput[] = [];

  for (const raw of payload.rows || []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (String(row.rate_type || '').toLowerCase() !== 'cash') continue;
    if (wantedCity && norm(String(row.city || '')) !== wantedCity) continue;
    const price = num(row.rate_amount);
    if (!price) continue;
    const accepted = record('price-transparency', search, price, 'discounted_cash', {
      providerName: typeof row.hospital_name === 'string' ? row.hospital_name : undefined,
      city: typeof row.city === 'string' ? row.city : undefined,
      state: typeof row.state === 'string' ? row.state : undefined,
      observedAt: typeof row.snapshot_date === 'string' ? row.snapshot_date : undefined,
      sourceUrl: typeof row.source_mrf_url === 'string' ? row.source_mrf_url : 'https://pricetransparency.io/',
    });
    if (accepted) observations.push(accepted);
  }

  return result('price-transparency', 'PriceTransparency.io', observations, {
    sourceScope: wantedCity ? `Exact-city hospital discounted-cash rows: ${search.city}, ${search.state || ''}` : search.state ? `${search.state} hospital discounted-cash rows` : 'National hospital discounted-cash rows',
    attribution: 'Hospital machine-readable files surfaced through PriceTransparency.io.',
    headlineEligible: Boolean(wantedCity ? observations.length : !search.city),
  });
}

// ---------------------------------------------------------------------------
// Hospital Ledger — CC0/open hospital MRF index. The public cpt-index schema can
// evolve, so this reader is defensive and accepts only explicitly cash-named
// fields. If the index does not expose local geography we keep it as supporting
// evidence rather than a local headline vote.
// ---------------------------------------------------------------------------
let hospitalLedgerIndexPromise: Promise<unknown> | null = null;
function hospitalLedgerIndex() {
  if (!hospitalLedgerIndexPromise) {
    hospitalLedgerIndexPromise = fetchJson('https://www.hospitalledger.com/api/cpt-index').catch((error) => {
      hospitalLedgerIndexPromise = null;
      throw error;
    });
  }
  return hospitalLedgerIndexPromise;
}

function collectLedgerCandidates(value: unknown, code: string, out: Record<string, unknown>[], depth = 0) {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    for (const child of value) collectLedgerCandidates(child, code, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const objectCode = String(obj.code ?? obj.cpt ?? obj.hcpcs ?? obj.billing_code ?? '').trim();
  if (objectCode === code) out.push(obj);
  if (code in obj) collectLedgerCandidates(obj[code], code, out, depth + 1);
  for (const [key, child] of Object.entries(obj)) {
    if (key === code) continue;
    if (child && typeof child === 'object') collectLedgerCandidates(child, code, out, depth + 1);
  }
}

function cashFromLedger(obj: Record<string, unknown>) {
  const directKeys = ['cash', 'cash_price', 'discounted_cash', 'discounted_cash_price', 'self_pay', 'self_pay_price'];
  for (const key of directKeys) {
    const value = num(obj[key]);
    if (value && value > 0) return value;
  }
  for (const key of ['cash_median', 'median_cash', 'cash_avg', 'average_cash']) {
    const value = num(obj[key]);
    if (value && value > 0) return value;
  }
  return null;
}

async function hospitalLedger(search: Search): Promise<OpenCashSourceResult> {
  const payload = await hospitalLedgerIndex();
  const candidates: Record<string, unknown>[] = [];
  collectLedgerCandidates(payload, search.procedureCode, candidates);
  const wantedCity = norm(search.city);
  const wantedState = norm(search.state);
  const observations: PriceObservationInput[] = [];

  for (const row of candidates.slice(0, 5000)) {
    const city = String(row.city ?? row.provider_city ?? row.hospital_city ?? '');
    const state = String(row.state ?? row.provider_state ?? row.hospital_state ?? '');
    if (wantedCity && city && norm(city) !== wantedCity) continue;
    if (wantedState && state && norm(state) !== wantedState) continue;
    const price = cashFromLedger(row);
    if (!price) continue;
    const providerName = String(row.hospital_name ?? row.provider_name ?? row.facility_name ?? row.name ?? '').trim() || undefined;
    const accepted = record('hospital-ledger', search, price, 'discounted_cash', {
      providerName,
      city: city || undefined,
      state: state || undefined,
      postalCode: String(row.zip ?? row.zip_code ?? row.postal_code ?? '').trim() || undefined,
      sourceUrl: 'https://www.hospitalledger.com/',
    });
    if (accepted) observations.push(accepted);
  }

  const hasLocalGeography = Boolean(wantedCity && observations.some((row) => norm(row.city) === wantedCity));
  return result('hospital-ledger', 'Hospital Ledger', observations, {
    sourceScope: hasLocalGeography ? `Exact-city CC0 hospital cash rows: ${search.city}` : 'Open hospital discounted-cash index',
    attribution: 'Hospital Ledger CC0 standardized hospital price data.',
    headlineEligible: search.city ? hasLocalGeography : observations.length > 0,
  });
}

// ---------------------------------------------------------------------------
// MarketCare — real provider cash quotes/published menus in Austin. The public
// index exposes the lowest verified cash quote per procedure. Because that is a
// floor rather than a distribution, it is supporting evidence and not a median
// vote in the headline benchmark.
// ---------------------------------------------------------------------------
async function marketCare(search: Search): Promise<OpenCashSourceResult> {
  const isAustin = !search.city || (norm(search.city) === 'austin' && norm(search.state) === 'tx');
  if (!isAustin) return result('marketcare', 'MarketCare', [], { sourceScope: 'Austin, TX only', headlineEligible: false });

  const html = await fetchText('https://marketcare.com/prices');
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const escaped = search.procedureCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}[^$]{0,180}\\$([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'));
  const price = match ? num(match[1]) : null;
  const accepted = price ? record('marketcare', search, price, 'cash', {
    providerName: 'MarketCare Austin verified cash index',
    city: 'Austin',
    state: 'TX',
    sourceUrl: 'https://marketcare.com/prices',
  }) : null;

  return result('marketcare', 'MarketCare', accepted ? [accepted] : [], {
    sourceScope: 'Austin provider cash quotes; displayed value is the public verified cash floor for the procedure.',
    attribution: 'MarketCare Austin Cash-Pay Price Index.',
    disclaimer: 'Supporting floor evidence only; not used as a median headline vote because the public index exposes the lowest verified quote.',
    headlineEligible: false,
  });
}

// ---------------------------------------------------------------------------
// TestWell — no-auth direct-purchase lab catalog. This is marketplace/direct-pay
// evidence, useful to Occu-Med for lab quote sanity checks, but it is not a local
// clinic market median.
// ---------------------------------------------------------------------------
function findArrays(value: unknown, out: unknown[][], depth = 0) {
  if (depth > 6 || value == null) return;
  if (Array.isArray(value)) {
    out.push(value);
    for (const child of value) findArrays(child, out, depth + 1);
  } else if (typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) findArrays(child, out, depth + 1);
  }
}

async function testWell(search: Search): Promise<OpenCashSourceResult> {
  if (!/^\d{5}$/.test(search.procedureCode)) return result('testwell', 'TestWell', [], { sourceScope: 'Direct-pay lab catalog', headlineEligible: false });
  const payload = await fetchJson(`https://www.test-well.com/api/catalog.json?q=${encodeURIComponent(search.procedureCode)}&orderable=true&limit=20`);
  const arrays: unknown[][] = [];
  findArrays(payload, arrays);
  const observations: PriceObservationInput[] = [];
  const seen = new Set<string>();

  for (const list of arrays) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const codeText = JSON.stringify(item).toUpperCase();
      if (!codeText.includes(search.procedureCode.toUpperCase())) continue;
      const price = num(item.price ?? item.price_usd ?? item.cash_price ?? item.amount);
      if (!price) continue;
      const name = String(item.name ?? item.title ?? item.slug ?? 'TestWell direct-pay lab');
      const signature = `${name}|${price}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const accepted = record('testwell', search, price, 'direct_pay', {
        providerName: `TestWell — ${name}`,
        sourceUrl: typeof item.order_url === 'string' ? item.order_url : 'https://www.test-well.com/pricing',
      });
      if (accepted) observations.push(accepted);
    }
  }

  return result('testwell', 'TestWell', observations, {
    sourceScope: 'National direct-purchase laboratory catalog; processing fee may apply.',
    attribution: 'TestWell public no-auth catalog.',
    headlineEligible: !search.city,
  });
}

// ---------------------------------------------------------------------------
// LabTestInsight — verified advertised direct-pay lab prices from provider pages.
// We use only the published cross-provider median for a small set of common
// occupational-health labs and never synthesize missing tests.
// ---------------------------------------------------------------------------
const LABTEST_SLUG_BY_CODE: Record<string, string> = {
  '80053': 'cmp-test',
  '85025': 'cbc-test',
  '83036': 'hemoglobin-a1c',
  '80061': 'lipid-panel',
  '84153': 'psa-test',
  '86141': 'hs-crp',
};

async function labTestInsight(search: Search): Promise<OpenCashSourceResult> {
  const slug = LABTEST_SLUG_BY_CODE[search.procedureCode];
  if (!slug) return result('labtestinsight', 'LabTestInsight', [], { sourceScope: 'Verified direct-pay lab price index', headlineEligible: false });
  const url = `https://labtestinsight.com/price-index/${slug}/`;
  const html = await fetchText(url);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const median = text.match(/median across the\s+\d+\s+providers we track is\s*\$([0-9.,]+)/i);
  const price = median ? num(median[1]) : null;
  const accepted = price ? record('labtestinsight', search, price, 'direct_pay', {
    providerName: 'LabTestInsight direct-pay provider median',
    sourceUrl: url,
  }) : null;
  return result('labtestinsight', 'LabTestInsight', accepted ? [accepted] : [], {
    sourceScope: 'National advertised direct-pay lab prices collected from provider public pricing pages.',
    attribution: 'LabTestInsight Lab Test Price Index.',
    headlineEligible: !search.city,
  });
}

// ---------------------------------------------------------------------------
// Real Dental Costs — open CC-BY dental index. We accept ONLY state rows whose
// upstream basis is explicitly observed. Modelled low/high bands, estimated
// procedures, Medicaid and insurance outputs are ignored.
// ---------------------------------------------------------------------------
const DENTAL_FAMILY_HINT: Record<string, string> = {
  D0150: 'exam', D0180: 'exam', D1110: 'clean', D4341: 'deep clean', D4342: 'deep clean',
  D7140: 'extract', D7210: 'extract', D3310: 'root canal', D3320: 'root canal', D3330: 'root canal',
  D2740: 'crown', D6010: 'implant',
};

async function realDentalCosts(search: Search): Promise<OpenCashSourceResult> {
  const hint = DENTAL_FAMILY_HINT[search.procedureCode.toUpperCase()];
  if (!hint || !search.state) return result('real-dental-costs', 'Real Dental Costs', [], { sourceScope: 'Observed state dental cash index', headlineEligible: false });
  const proceduresPayload = await fetchJson('https://realdentalcosts.com/api/v1/procedures.json');
  const arrays: unknown[][] = [];
  findArrays(proceduresPayload, arrays);
  let slug: string | undefined;
  for (const list of arrays) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const label = norm(String(row.label ?? row.name ?? row.procedure ?? ''));
      if (label.includes(norm(hint))) {
        slug = String(row.slug ?? row.id ?? '').trim() || undefined;
        if (slug) break;
      }
    }
    if (slug) break;
  }
  if (!slug) return result('real-dental-costs', 'Real Dental Costs', [], { sourceScope: 'Observed state dental cash index', headlineEligible: false });

  const payload = await fetchJson(`https://realdentalcosts.com/api/v1/procedure/${encodeURIComponent(slug)}.json`);
  const candidates: Record<string, unknown>[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 7 || value == null) return;
    if (Array.isArray(value)) return value.forEach((child) => walk(child, depth + 1));
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    const state = String(obj.state ?? obj.state_code ?? obj.abbr ?? '').toUpperCase();
    if (state === search.state?.toUpperCase()) candidates.push(obj);
    for (const child of Object.values(obj)) if (child && typeof child === 'object') walk(child, depth + 1);
  };
  walk(payload);

  const observations: PriceObservationInput[] = [];
  for (const row of candidates) {
    const basis = String(row.basis ?? row.price_type ?? '').toLowerCase();
    if (!basis.includes('observed')) continue;
    const price = num(row.avg_usd ?? row.average_usd ?? row.avg ?? row.average ?? row.mean);
    if (!price) continue;
    const accepted = record('real-dental-costs', search, price, 'cash', {
      providerName: `Real Dental Costs observed ${search.state} market average`,
      state: search.state,
      sourceUrl: `https://realdentalcosts.com/api/v1/procedure/${encodeURIComponent(slug)}.json`,
    });
    if (accepted) observations.push(accepted);
  }

  return result('real-dental-costs', 'Real Dental Costs', observations, {
    sourceScope: `${search.state} observed dental cash-market average only; modelled bands excluded.`,
    attribution: 'Real Dental Costs open CC BY 4.0 dataset.',
    headlineEligible: false,
  });
}

// ---------------------------------------------------------------------------
// Expected Health — clinic-published imaging cash prices, published as a
// quarterly metro CSV. This is modality-level evidence, not an exact CPT row,
// so it is supporting context and never overrides exact-code sources.
// ---------------------------------------------------------------------------
function imagingModality(search: Search) {
  const name = norm(search.procedureName);
  const code = search.procedureCode;
  if (name.includes('mri') || /^(705|715|7214|7215|7219|732|737)/.test(code)) return 'mri';
  if (name.includes('ct ') || name.startsWith('ct') || /^(704|712|7212|7213|741)/.test(code)) return 'ct';
  if (name.includes('ultrasound') || /^(765|766|767|768|769)/.test(code)) return 'ultrasound';
  if (name.includes('mamm') || /^(77065|77066|77067)$/.test(code)) return 'mammogram';
  if (name.includes('dexa') || name.includes('bone density') || /^(77080|77081|77085|77086)$/.test(code)) return 'dexa';
  if (name.includes('pet') || /^(7881)/.test(code)) return 'pet';
  if (name.includes('x ray') || name.includes('x-ray') || /^(710|720|7210|731|735|736)/.test(code)) return 'x-ray';
  return null;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { cells.push(current.trim()); current = ''; }
    else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

async function expectedHealth(search: Search): Promise<OpenCashSourceResult> {
  const modality = imagingModality(search);
  if (!modality) return result('expected-health', 'Expected Health', [], { sourceScope: 'Clinic-published imaging cash index', headlineEligible: false });
  const csv = await fetchText('https://expectedhealthcare.com/resources/costs/imaging-price-index/download/');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return result('expected-health', 'Expected Health', [], { sourceScope: 'Clinic-published imaging cash index', headlineEligible: false });
  const headers = parseCsvLine(lines[0]).map(norm);
  const metroIndex = headers.findIndex((h) => h.includes('metro'));
  const modalityIndex = headers.findIndex((h) => h.includes(modality) && (h.includes('median') || h === modality));
  if (metroIndex < 0 || modalityIndex < 0) return result('expected-health', 'Expected Health', [], { sourceScope: 'Clinic-published imaging cash index', headlineEligible: false });

  const city = norm(search.city);
  const observations: PriceObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const metro = cells[metroIndex] || '';
    if (city && !norm(metro).includes(city)) continue;
    const price = num(cells[modalityIndex]);
    if (!price) continue;
    const accepted = record('expected-health', search, price, 'cash', {
      providerName: `Expected Health ${metro || 'national'} imaging median`,
      city: search.city,
      state: search.state,
      sourceUrl: 'https://expectedhealthcare.com/resources/costs/imaging-price-index/',
    });
    if (accepted) observations.push(accepted);
  }

  return result('expected-health', 'Expected Health', observations, {
    sourceScope: city ? `Clinic-weighted ${modality.toUpperCase()} cash median for matching metro` : `Published ${modality.toUpperCase()} cash index`,
    attribution: 'Expected Health Imaging Price Index; clinic-published self-pay prices.',
    headlineEligible: Boolean(city && observations.length),
  });
}

export async function searchOccumedOpenCashSources(search: Search): Promise<OpenCashSourceResult[]> {
  const jobs = [
    priceTransparency(search),
    hospitalLedger(search),
    marketCare(search),
    testWell(search),
    labTestInsight(search),
    realDentalCosts(search),
    expectedHealth(search),
  ];

  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((entry) => entry.status === 'fulfilled' ? [entry.value] : []);
}
