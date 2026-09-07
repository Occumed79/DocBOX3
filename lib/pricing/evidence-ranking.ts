import type { PriceObservationInput } from '@/lib/pricing/source-registry';

type RankableSummary = {
  count: number;
  low: number | null;
  median: number | null;
  high: number | null;
  p25: number | null;
  p75: number | null;
};

export type RankablePricingSource = {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'empty' | 'error' | 'unconfigured';
  observations: PriceObservationInput[];
  summary: RankableSummary;
  sourceScope?: string;
  dataRefreshed?: string;
};

export type EvidenceRankingItem = {
  sourceId: string;
  score: number;
  rank: number;
  reason: string;
};

export type EvidenceRanking = {
  provider: 'cohere+cerebras' | 'cohere' | 'cerebras' | 'deterministic';
  advisoryOnly: true;
  ranked: EvidenceRankingItem[];
  note: string;
};

type RankingContext = {
  procedureCode: string;
  procedureName: string;
  market?: string;
};

type EvidenceFacts = {
  sourceId: string;
  sourceName: string;
  recordCount: number;
  providerCoverage: number;
  geocodedCoverage: number;
  datedCoverage: number;
  freshestDaysOld: number | null;
  paymentBases: string[];
  scope: string;
};

const COHERE_URL = 'https://api.cohere.com/v2/rerank';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const COHERE_MODEL = 'rerank-v4.0-fast';
const CEREBRAS_MODEL = 'gpt-oss-120b';
const AI_RANKING_BUDGET_MS = 8_000;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function uniqueKeys(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function cohereKeys() {
  return uniqueKeys([
    process.env.COHERE_API_KEY,
    process.env.COHERE_API_KEY_2,
    process.env.COHERE_API_KEY_3,
    process.env.COHERE_API_KEY_4,
  ]);
}

function cerebrasKeys() {
  return uniqueKeys([
    process.env.CEREBRAS_API_KEY,
    process.env.CEREBRAS_API_KEY_2,
  ]);
}

function daysOld(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
}

function evidenceFacts(source: RankablePricingSource): EvidenceFacts {
  const observations = source.observations || [];
  const count = observations.length || source.summary.count || 0;
  const denominator = Math.max(1, observations.length);
  const providerCoverage = observations.length
    ? observations.filter((row) => Boolean(row.providerName)).length / denominator
    : 0;
  const geocodedCoverage = observations.length
    ? observations.filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)).length / denominator
    : 0;
  const datedCoverage = observations.length
    ? observations.filter((row) => Boolean(row.observedAt)).length / denominator
    : 0;
  const ages = observations
    .map((row) => daysOld(row.observedAt))
    .filter((value): value is number => value !== null);
  const refreshedAge = daysOld(source.dataRefreshed);
  if (refreshedAge !== null) ages.push(refreshedAge);

  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    recordCount: count,
    providerCoverage,
    geocodedCoverage,
    datedCoverage,
    freshestDaysOld: ages.length ? Math.min(...ages) : null,
    paymentBases: [...new Set(observations.map((row) => row.paymentBasis))],
    scope: source.sourceScope || 'local cash observations',
  };
}

function deterministicScore(facts: EvidenceFacts) {
  const countScore = clamp(Math.log10(facts.recordCount + 1) / 2);
  const freshnessScore = facts.freshestDaysOld === null
    ? 0.35
    : clamp(1 - facts.freshestDaysOld / 730);
  const explicitCashScore = facts.paymentBases.length ? 1 : 0.7;
  return clamp(
    countScore * 0.24
    + facts.providerCoverage * 0.18
    + facts.geocodedCoverage * 0.22
    + facts.datedCoverage * 0.10
    + freshnessScore * 0.16
    + explicitCashScore * 0.10,
  );
}

function fallbackReason(facts: EvidenceFacts) {
  const details = [
    `${facts.recordCount} qualifying self-pay record${facts.recordCount === 1 ? '' : 's'}`,
    `${Math.round(facts.geocodedCoverage * 100)}% geocoded`,
    `${Math.round(facts.providerCoverage * 100)}% provider-attributed`,
  ];
  if (facts.freshestDaysOld !== null) details.push(`freshest evidence ${Math.round(facts.freshestDaysOld)} days old`);
  return details.join(' · ');
}

function rankQuery(context: RankingContext) {
  return [
    `Rank evidence quality for self-pay healthcare pricing for ${context.procedureCode} ${context.procedureName}.`,
    context.market ? `Market: ${context.market}.` : '',
    'Prioritize explicit cash/self-pay provenance, geographic specificity, provider-level attribution, freshness, and enough independent observations.',
    'Do not prefer a source because its numeric price is higher or lower. Do not infer, estimate, alter, or recommend any price.',
  ].filter(Boolean).join(' ');
}

function documentFor(facts: EvidenceFacts) {
  return JSON.stringify({
    sourceId: facts.sourceId,
    sourceName: facts.sourceName,
    recordCount: facts.recordCount,
    providerAttributionPercent: Math.round(facts.providerCoverage * 100),
    geocodedPercent: Math.round(facts.geocodedCoverage * 100),
    datedPercent: Math.round(facts.datedCoverage * 100),
    freshestDaysOld: facts.freshestDaysOld === null ? 'unknown' : Math.round(facts.freshestDaysOld),
    paymentBases: facts.paymentBases,
    scope: facts.scope,
  });
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const payload = response.ok ? await response.json() as T : null;
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function remainingTimeout(deadline: number, capMs: number) {
  return Math.max(1, Math.min(capMs, deadline - Date.now()));
}

async function cohereScores(
  facts: EvidenceFacts[],
  context: RankingContext,
  deadline: number,
): Promise<Map<string, number> | null> {
  const keys = cohereKeys();
  if (!keys.length || facts.length < 2) return null;

  for (const key of keys) {
    if (Date.now() >= deadline) break;
    try {
      const { response, payload } = await fetchJsonWithTimeout<{ results?: Array<{ index?: number; relevance_score?: number }> }>(COHERE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: COHERE_MODEL,
          query: rankQuery(context),
          documents: facts.map(documentFor),
          top_n: facts.length,
        }),
      }, remainingTimeout(deadline, 5_000));

      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) continue;
        return null;
      }
      const scores = new Map<string, number>();
      for (const result of payload?.results || []) {
        if (!Number.isInteger(result.index) || typeof result.relevance_score !== 'number') continue;
        const source = facts[result.index as number];
        if (source) scores.set(source.sourceId, clamp(result.relevance_score));
      }
      return scores.size ? scores : null;
    } catch {
      if (Date.now() >= deadline) break;
      return null;
    }
  }
  return null;
}

function extractJsonObject(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as {
      rankedSourceIds?: string[];
      reasons?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

async function cerebrasReview(
  facts: EvidenceFacts[],
  context: RankingContext,
  cohere: Map<string, number> | null,
  deadline: number,
): Promise<{ order: string[]; reasons: Record<string, string> } | null> {
  const keys = cerebrasKeys();
  if (!keys.length || facts.length < 2) return null;

  const allowedIds = new Set(facts.map((fact) => fact.sourceId));
  const evidence = facts.map((fact) => ({
    ...JSON.parse(documentFor(fact)),
    cohereRelevance: cohere?.get(fact.sourceId) ?? null,
  }));
  const prompt = [
    rankQuery(context),
    'You are reviewing evidence quality only. The actual price values are intentionally omitted.',
    'Return ONLY JSON in this exact shape: {"rankedSourceIds":["id"],"reasons":{"id":"brief reason"}}.',
    'Use only source IDs supplied below. Do not invent sources, prices, benchmarks, or recommendations.',
    JSON.stringify(evidence),
  ].join('\n');

  for (const key of keys) {
    if (Date.now() >= deadline) break;
    try {
      const { response, payload } = await fetchJsonWithTimeout<{ choices?: Array<{ message?: { content?: string } }> }>(CEREBRAS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: CEREBRAS_MODEL,
          temperature: 0,
          max_tokens: 500,
          messages: [
            { role: 'system', content: 'Rank healthcare pricing evidence quality. Never create or modify a price.' },
            { role: 'user', content: prompt },
          ],
        }),
      }, remainingTimeout(deadline, 6_000));

      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) continue;
        return null;
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = extractJsonObject(content);
      if (!parsed) return null;
      const order = (parsed.rankedSourceIds || []).filter((id) => allowedIds.has(id));
      const reasons = Object.fromEntries(
        Object.entries(parsed.reasons || {}).filter(([id, reason]) => allowedIds.has(id) && typeof reason === 'string'),
      );
      return order.length ? { order, reasons } : null;
    } catch {
      if (Date.now() >= deadline) break;
      return null;
    }
  }
  return null;
}

export async function rankPricingEvidence(
  sources: RankablePricingSource[],
  context: RankingContext,
): Promise<EvidenceRanking> {
  const eligible = sources.filter((source) => source.status === 'ok' && source.summary.median !== null);
  const facts = eligible.map(evidenceFacts);
  if (!facts.length) {
    return {
      provider: 'deterministic',
      advisoryOnly: true,
      ranked: [],
      note: 'No qualifying source evidence was available to rank. Ranking never changes benchmark prices.',
    };
  }

  const deterministic = new Map(facts.map((fact) => [fact.sourceId, deterministicScore(fact)]));
  const deadline = Date.now() + AI_RANKING_BUDGET_MS;
  const cohere = await cohereScores(facts, context, deadline);
  const cerebras = Date.now() < deadline
    ? await cerebrasReview(facts, context, cohere, deadline)
    : null;
  const cerebrasOrder = new Map<string, number>();
  if (cerebras?.order.length) {
    const denominator = Math.max(1, cerebras.order.length - 1);
    cerebras.order.forEach((id, index) => cerebrasOrder.set(id, 1 - index / denominator));
  }

  const hasCohere = Boolean(cohere?.size);
  const hasCerebras = Boolean(cerebras?.order.length);
  const scored = facts.map((fact) => {
    const base = deterministic.get(fact.sourceId) ?? 0;
    const semantic = cohere?.get(fact.sourceId) ?? base;
    const review = cerebrasOrder.get(fact.sourceId) ?? base;
    const score = hasCohere && hasCerebras
      ? base * 0.55 + semantic * 0.35 + review * 0.10
      : hasCohere
        ? base * 0.60 + semantic * 0.40
        : hasCerebras
          ? base * 0.90 + review * 0.10
          : base;
    return {
      sourceId: fact.sourceId,
      score: clamp(score),
      reason: cerebras?.reasons[fact.sourceId] || fallbackReason(fact),
    };
  }).sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId));

  const provider: EvidenceRanking['provider'] = hasCohere && hasCerebras
    ? 'cohere+cerebras'
    : hasCohere
      ? 'cohere'
      : hasCerebras
        ? 'cerebras'
        : 'deterministic';

  return {
    provider,
    advisoryOnly: true,
    ranked: scored.map((item, index) => ({ ...item, rank: index + 1 })),
    note: 'Evidence ranking is advisory only. It never creates, alters, estimates, or corrects a price and does not participate in benchmark arithmetic.',
  };
}
