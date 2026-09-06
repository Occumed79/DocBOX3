import { acceptSelfPayObservation, provenanceFamilyForSource, type PriceObservationInput } from '@/lib/pricing/source-registry';
import { summarizePrices } from '@/lib/pricing/statistics';

type Search = {
  procedureCode: string;
  procedureName: string;
  city?: string;
  state?: string;
};

type StudyRule = {
  modalityPath: 'x-ray' | 'mri';
  urlSuffix: 'x-ray' | 'mri';
  patterns: RegExp[];
};

export type RadiologyAssistResult = {
  sourceId: 'radiology-assist';
  sourceName: 'RadiologyAssist';
  provenanceFamily: ReturnType<typeof provenanceFamilyForSource>;
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
  sourceScope: string;
  attribution: string;
  disclaimer: string;
  headlineEligible: boolean;
};

const RULES: Record<string, StudyRule> = {
  '71045': {
    modalityPath: 'x-ray', urlSuffix: 'x-ray',
    patterns: [
      /(?:Chest\s+X[- ]?ray|X[- ]?ray\s+Chest)\s*(?:[-–:]\s*)?1\s*View[^$]{0,80}\$([0-9][0-9,.]*)/i,
      /Chest\s+X[- ]?ray\s+1\s*view[^$]{0,80}\$([0-9][0-9,.]*)/i,
    ],
  },
  '71046': {
    modalityPath: 'x-ray', urlSuffix: 'x-ray',
    patterns: [
      /(?:Chest\s+X[- ]?ray|X[- ]?ray\s+Chest)\s*(?:[-–:]\s*)?2\s*Views?[^$]{0,80}\$([0-9][0-9,.]*)/i,
      /Chest\s+X[- ]?ray\s+2\s*views?[^$]{0,80}\$([0-9][0-9,.]*)/i,
    ],
  },
  '70551': {
    modalityPath: 'mri', urlSuffix: 'mri',
    patterns: [/MRI\s+Brain\s+w\/?o\s+contrast[^$]{0,80}\$([0-9][0-9,.]*)/i],
  },
  '72141': {
    modalityPath: 'mri', urlSuffix: 'mri',
    patterns: [/MRI\s+Cervical\s+Spine\s+w\/?o\s+contrast[^$]{0,80}\$([0-9][0-9,.]*)/i],
  },
  '72148': {
    modalityPath: 'mri', urlSuffix: 'mri',
    patterns: [/MRI\s+Lumbar\s+Spine\s+w\/?o\s+contrast[^$]{0,80}\$([0-9][0-9,.]*)/i],
  },
  '73721': {
    modalityPath: 'mri', urlSuffix: 'mri',
    patterns: [/MRI\s+Knee\s+w\/?o\s+contrast[^$]{0,80}\$([0-9][0-9,.]*)/i],
  },
  '74181': {
    modalityPath: 'mri', urlSuffix: 'mri',
    patterns: [/MRI\s+Abdomen\s+w\/?o\s+contrast[^$]{0,80}\$([0-9][0-9,.]*)/i],
  },
};

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function dollars(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`RadiologyAssist returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function empty(scope: string, disclaimer = 'No exact study row was available for this code and market.') : RadiologyAssistResult {
  return {
    sourceId: 'radiology-assist',
    sourceName: 'RadiologyAssist',
    provenanceFamily: provenanceFamilyForSource('radiology-assist'),
    observations: [],
    summary: summarizePrices([]),
    sourceScope: scope,
    attribution: 'RadiologyAssist published self-pay program rates.',
    disclaimer,
    headlineEligible: false,
  };
}

export async function searchRadiologyAssistCash(search: Search): Promise<RadiologyAssistResult> {
  const code = search.procedureCode.toUpperCase();
  const rule = RULES[code];
  if (!rule || !search.city || !search.state) {
    return empty('Exact-study RadiologyAssist marketplace cash; city/state required.');
  }

  const marketSlug = `${slug(search.city)}-${slug(search.state)}`;
  const url = `https://radiologyassist.com/facility-locations-rates/locations-by-city/${rule.modalityPath}/${marketSlug}-${rule.urlSuffix}/`;

  let html: string;
  try {
    html = await fetchText(url);
  } catch {
    return empty(`${search.city}, ${search.state} exact-study RadiologyAssist market.`, 'RadiologyAssist does not expose a matching public city page for this request.');
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');

  let price: number | null = null;
  for (const pattern of rule.patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    price = dollars(match[1]);
    if (price) break;
  }

  if (!price) return empty(`${search.city}, ${search.state} exact-study RadiologyAssist market.`);

  const observation = acceptSelfPayObservation({
    sourceId: 'radiology-assist',
    procedureCode: search.procedureCode,
    procedureName: search.procedureName,
    price,
    paymentBasis: 'marketplace_cash' as const,
    providerName: `RadiologyAssist ${search.city} marketplace rate`,
    city: search.city,
    state: search.state,
    sourceUrl: url,
  });

  const observations = observation ? [observation] : [];
  return {
    sourceId: 'radiology-assist',
    sourceName: 'RadiologyAssist',
    provenanceFamily: provenanceFamilyForSource('radiology-assist'),
    observations,
    summary: summarizePrices(observations.map((item) => item.price)),
    sourceScope: `${search.city}, ${search.state}; exact ${code} prepaid self-pay marketplace rate.`,
    attribution: 'RadiologyAssist published self-pay program rate.',
    disclaimer: 'Marketplace rate is valid only when the study is scheduled and prepaid through RadiologyAssist. It is kept separate from provider-posted and hospital-MRF cash.',
    headlineEligible: observations.length > 0,
  };
}
