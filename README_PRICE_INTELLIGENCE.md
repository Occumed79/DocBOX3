# Price Intelligence

DocBOX3 is being repurposed into a self-pay healthcare pricing intelligence tool while preserving the existing landing experience.

## Product sections

- **Price Lookup** — procedure + location + radius self-pay benchmark.
- **Price Map** — independent MapTiler heat map; does not require a lookup or quote analysis first.
- **Compare Quote** — compare a provider's proposed cash fee against the local provenance-balanced self-pay benchmark.
- **Reports** — printable leadership brief with provenance-family and source-by-source evidence.
- **Sources** — provenance, integration readiness, Occu-Med relevance, and eligibility rules for every source.

## Hard self-pay rule

Only prices explicitly identified as one of the following can participate in calculations:

- `cash`
- `self_pay`
- `discounted_cash`
- `uninsured`
- `direct_pay`
- `marketplace_cash`

The following are rejected:

- Medicare
- Medicaid
- commercial negotiated rates
- insurer allowed amounts
- insurance claims / claims averages
- gross charges
- chargemaster/list charges
- unknown payment basis

This is enforced both by TypeScript admission logic and the PostgreSQL `pi_price_observations.payment_basis` CHECK constraint.

## Provenance-balanced benchmark

A source is not automatically an independent market opinion. Turquoise, Hospital Ledger, PriceTransparency.io, MedRates, MedCompare and FairVisit can all surface cash rows originating in hospital machine-readable files. Counting every website independently would multiply the influence of the same underlying hospital pricing evidence.

The benchmark therefore assigns every source to an underlying provenance family:

- `hospital_mrf_cash`
- `provider_verified_quote`
- `provider_published_cash`
- `direct_pay_marketplace`
- `imaging_clinic_cash`
- `dental_observed_cash`
- `lab_direct_purchase`

For the headline benchmark:

1. Strictly eligible self-pay observations are collected.
2. Pooled observations are deduplicated by provenance family + provider + market + procedure + price.
3. A median is calculated inside each eligible provenance family.
4. The headline benchmark is the median of those family medians.

This prevents multiple aggregators of the same hospital-MRF cash row from receiving multiple independent votes while still preserving genuinely independent provider quotes, imaging-clinic prices, dental observations, marketplace offers and direct-purchase lab evidence.

## Local-market integrity

Local city/ZIP searches are geocoded with MapTiler. Coordinate-capable source observations must pass the requested radius before they can enter the local benchmark.

A public source without usable coordinates must independently prove an exact local market or remain supporting-only evidence. State or national data is never silently represented as a local benchmark.

Map-only coordinate enrichment happens **after** benchmark arithmetic and evidence ranking. It may add approximate ZIP/city coordinates so an otherwise valid observation can be displayed on the Price Map, but it cannot change a price, payment basis, source median, provenance family, or headline eligibility decision.

## Source integration states

- **Live** — the application can query the source now.
- **Registered** — relevant source with explicit provenance/admission rules, but it contributes zero until a deterministic first-party observation path is available.
- **Credential required** — an official programmatic source exists, but it contributes zero until the source issues the required access credential.

### Live sources

#### Turquoise Health
OAuth API queried with `pricing.type = "cash"`. Returned records are rejected again unless `pricing.type === "cash"`, and any payer/network-bearing row is excluded.

#### Hospital Ledger
Open/CC0 standardized hospital transparency data. Only fields explicitly identifying cash/self-pay are accepted.

#### PriceTransparency.io
Public hospital pricing API queried with `rate_type=cash` only.

#### MedRates.fyi
Normalized hospital pricing files. Only explicit cash/self-pay fields are accepted.

#### MedCompare
Hospital transparency source. Only explicit discounted-cash/self-pay fields are accepted.

#### FairVisitHealth
Hospital-published discounted-cash values only. Medicare fields and state/national fallbacks are excluded from local benchmarks.

#### Loa
Only source-labeled cash, discounted-cash, package-cash, or verified self-pay rows are accepted. Negotiated and generic unlabeled MRF rows are rejected.

#### MarketCare
Real provider cash quotes captured by phone or provider cash menus in Austin. Its public lowest verified cash quote is supporting floor evidence rather than a headline median vote.

#### Expected Health
Clinic-published imaging cash-price index. Metro/modality evidence is retained separately from exact CPT hospital data.

#### RadiologyAssist
Exact local prepaid/self-pay imaging marketplace rows. The current deterministic adapter supports exact known study rows including chest X-ray and selected MRI CPTs. National averages and nonmatching imaging rows are rejected.

#### TestWell
Direct-purchase laboratory catalog. Kept in the `lab_direct_purchase` provenance family rather than treated as a local clinic quote.

#### LabTestInsight
Verified advertised direct-pay laboratory price index for common occupational-health laboratory tests.

#### Real Dental Costs
Only explicitly observed dental-market rows are admitted. Modeled bands, Medicaid amounts and insurance values are rejected.

### Registered relevant sources

These sources remain visible because they are useful to Occu-Med, but they contribute zero until a stable deterministic first-party price path is available:

- **Solv ClearPrice** — physicals, urgent care, X-rays, vaccines, testing and drug screens.
- **DENTALPRICE** — actual dentist-posted cash prices only; generic “typical U.S.” ranges are never eligible.
- **DirectMedicine** — provider-published direct-pay services.
- **Sesame** — direct-pay outpatient marketplace.
- **SumHealth** — verification/fallback for explicit cash prices; hospital-MRF-derived rows remain in the hospital-MRF provenance family.

### Credential-required relevant source

#### MDsave / Tendo Marketplace
Official marketplace API can expose exact purchasable offers but requires source-issued credentials. It remains zero-weight until those credentials exist.

## Removed / inactive integrations

- **OpenDoc** — removed entirely because its provenance/inventory semantics were not strong enough for this benchmark.
- **FAIR Health** — removed from the active integration/configuration path. Standard claims/allowed/charge benchmarks are not eligible self-pay evidence.
- **ClearHealthCosts** — removed from the active integration/configuration path rather than leaving an inaccessible placeholder dependency.

## Advisory evidence ranking

AI is advisory evidence ranking only. Benchmark calculations are completed before ranking and numeric prices are intentionally omitted from AI ranking prompts.

### Cohere
Primary semantic reranker for evidence quality.

Default model: `rerank-v4.0-fast`.

Key failover order:

- `COHERE_API_KEY`
- `COHERE_API_KEY_2`
- `COHERE_API_KEY_3`
- `COHERE_API_KEY_4`

### Cerebras
Optional secondary reviewer/tie-breaker.

Default model: `gpt-oss-120b`.

Key failover order:

- `CEREBRAS_API_KEY`
- `CEREBRAS_API_KEY_2`

When both are available, evidence ordering blends deterministic evidence quality with Cohere and Cerebras. If either service fails, the ranking falls back safely; if both fail, ranking is fully deterministic. No ranking failure blocks pricing search.

The national Price Map deliberately bypasses external AI calls.

## Render variables

### Database / map

- `DATABASE_URL`
- `NEXT_PUBLIC_MAPTILER_KEY`

### Turquoise OAuth

These are the only current price-source credentials required by the application:

- `TURQUOISE_ORGANIZATION_ID`
- `TURQUOISE_CLIENT_ID`
- `TURQUOISE_CLIENT_SECRET`

The backend automatically mints, caches and refreshes short-lived Turquoise access tokens.

### Advisory ranking

- `CEREBRAS_API_KEY`
- `CEREBRAS_API_KEY_2`
- `COHERE_API_KEY`
- `COHERE_API_KEY_2`
- `COHERE_API_KEY_3`
- `COHERE_API_KEY_4`

No ClearHealthCosts, FAIR Health, or old `TURQUOISE_RAW_CASH_FEED_*` variables are required.

## Dependency security and reproducibility

The application tracks Next.js 15.5.25 and keeps the committed npm lockfile synchronized with `package.json`. CI regenerates the lockfile in verification mode and fails if the committed lockfile would change.

Production dependency audit is also a release gate. `npm audit --omit=dev --audit-level=high` must pass before pricing-integrity checks or the production build can be considered green.

Root npm overrides keep vulnerable transitive releases out of the production dependency tree while remaining inside Next.js-compatible major versions:

- `nanoid` 3.3.18
- `postcss` 8.5.24
- `sharp` 0.35.4

The `Refresh dependency lockfile` workflow deterministically regenerates `package-lock.json` after `package.json` changes. Public-source smoke testing installs with `npm ci` so the live-source test uses the exact committed dependency graph.

## Verification

### Static pricing-integrity regression checks

Run:

```bash
npm run verify:pricing
```

The integrity suite verifies, among other things:

- only the six approved self-pay payment bases are database-admissible;
- Medicare, Medicaid, negotiated/insurance, claims, gross/chargemaster and unknown bases are excluded;
- Turquoise is queried and revalidated as cash only;
- provenance-family balancing and pooled deduplication remain present;
- the national map continues to bypass external AI ranking;
- map geocoding remains presentation-only;
- stale source-balanced UI language does not return;
- evidence families and evidence ranking remain visible;
- lookup does not silently hide sources after the first eight;
- FAIR Health/ClearHealthCosts inactive credentials do not return;
- OpenDoc remains physically absent.

GitHub Actions runs the dependency lock check, production audit, pricing-integrity suite and production build on the feature branch and on PRs targeting `main`.

### Public-source smoke test

Run:

```bash
npm run verify:public-sources
```

The GitHub public-source workflow starts the production Next.js server and exercises real external cash-price sources. It verifies that returned observations use only the approved payment bases and saves `public-source-smoke.json` as an artifact. It reruns after source, pricing-route, package, or lockfile changes.

### Deployed runtime matrix

A deployed instance can be exercised with:

```bash
PRICE_INTELLIGENCE_BASE_URL=https://your-service.example npm run verify:runtime
```

The runtime matrix checks representative Occu-Med-relevant scenarios across dental, cardiology, imaging, pulmonary, audiology and laboratory procedures and verifies that every returned observation remains in an approved self-pay payment basis.

GitHub also provides the manually triggered **Pricing runtime matrix** workflow. Supply the deployed base URL and it executes the matrix and uploads `runtime-source-matrix.json` as an artifact.

## Leadership brief

After a quote analysis, the report includes:

- provider quote;
- provenance-balanced self-pay median;
- dollar and percentage variance;
- market and radius;
- independent evidence-family medians;
- source-by-source medians/ranges;
- evidence ranking;
- methodology and exclusions;
- required source attribution/limitations.

Use **Print / Save PDF** for a browser-generated final brief.
