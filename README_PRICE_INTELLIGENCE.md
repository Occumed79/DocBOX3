# Price Intelligence

DocBOX3 is being repurposed into a self-pay healthcare pricing intelligence tool while preserving the existing landing experience.

## Product sections

- **Price Lookup** — procedure + location + radius self-pay benchmark.
- **Price Map** — independent MapTiler heat map; does not require a lookup or quote analysis first.
- **Compare Quote** — compare a provider's proposed cash fee against the local source-balanced self-pay benchmark.
- **Reports** — printable leadership brief with source-by-source evidence and methodology.
- **Sources** — provenance and eligibility rules for each data source.

## Hard data rule

Only prices explicitly identified as one of the following can participate in self-pay calculations:

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

This is enforced in both TypeScript and PostgreSQL.

## Benchmark methodology

Sources remain analytically separate. The headline benchmark is the median of each eligible live source's median so a source with a very large row count cannot overwhelm smaller independent sources.

For local searches, the requested city/ZIP is geocoded with MapTiler and geographic filtering is enforced. A local query is not silently converted into a state or national estimate if the requested market cannot be verified.

AI evidence ranking happens only **after** strict self-pay filtering and **after** benchmark arithmetic. Cohere and Cerebras can rank or explain evidence quality; they cannot create, alter, normalize, estimate, or correct a price and cannot change the benchmark.

## Live / connected cash sources

### MedRates.fyi
Only explicit cash/self-pay/discounted-cash fields are accepted.

### MedCompare
Only explicit cash/self-pay/discounted-cash values are accepted.

### FairVisitHealth
Uses the public hospital discounted-cash API for local medical pricing. The separate Medicare field is ignored. State/national fallbacks do not participate in a local headline benchmark. The API's list of cheapest nearby facilities is used for map evidence, not to calculate its median; the source-reported local cash distribution supplies the source median.

### Loa
Only source-labeled cash, discounted-cash, or explicit self-pay rows are accepted. Entity resolution is constrained to the exact city/state market and negotiated or generic MRF rows without a cash label are rejected.

### OpenDoc
Removed from the application. Its current provenance/inventory semantics are not strong enough for this benchmark, so it contributes no data and has no adapter in the repo.

## Licensed / permitted feeds

These adapters are present but contribute nothing until their permitted feed configuration is supplied to the deployment.

### ClearHealthCosts
Only explicit cash/self-pay observations are accepted.

### Turquoise Health
Only raw provider-published cash / Discounted Cash Price fields are accepted. The Consumer Pricing composite estimate, negotiated rates, claims-derived values, Medicare references, and gross charges are excluded.

### FAIR Health
Only a specifically licensed field/feed explicitly identified as cash/self-pay may be used. Claims-derived charge/allowed benchmarks and public out-of-network full-charge estimates are excluded.

## Advisory evidence ranking

### Cohere
Cohere is the primary semantic reranker for local source evidence. Ranking documents contain evidence-quality metadata such as source identity, record count, geographic completeness, provider attribution, freshness, and payment-basis labels. Numeric prices are intentionally omitted from the ranking prompt.

Default model: `rerank-v4.0-fast`.

Key failover order:
- `COHERE_API_KEY`
- `COHERE_API_KEY_2`
- `COHERE_API_KEY_3`
- `COHERE_API_KEY_4`

### Cerebras
Cerebras is an optional secondary reviewer/tie-breaker for evidence quality. It receives evidence-quality facts, not price values, and returns source ordering/reasons only.

Default model: `gpt-oss-120b`.

Key failover order:
- `CEREBRAS_API_KEY`
- `CEREBRAS_API_KEY_2`

### Ranking weights
When both are available, final evidence ordering is weighted:
- 55% deterministic evidence quality
- 35% Cohere relevance
- 10% Cerebras review order

If either external service fails, weights fall back safely. If both fail, ranking is fully deterministic. Pricing search still succeeds.

The independent national Price Map bypasses external AI ranking so procedure changes remain fast and do not generate unnecessary model calls.

## Render variables

### Map
- `NEXT_PUBLIC_MAPTILER_KEY`

### ClearHealthCosts
- `CLEARHEALTHCOSTS_API_URL`
- `CLEARHEALTHCOSTS_API_KEY`
- `CLEARHEALTHCOSTS_API_KEY_HEADER`
- `CLEARHEALTHCOSTS_API_METHOD`

### Turquoise raw cash feed
- `TURQUOISE_RAW_CASH_FEED_URL`
- `TURQUOISE_RAW_CASH_FEED_TOKEN`
- `TURQUOISE_RAW_CASH_FEED_TOKEN_HEADER`
- `TURQUOISE_RAW_CASH_FEED_METHOD`

### FAIR Health cash feed
- `FAIR_HEALTH_CASH_FEED_URL`
- `FAIR_HEALTH_CASH_FEED_TOKEN`
- `FAIR_HEALTH_CASH_FEED_TOKEN_HEADER`
- `FAIR_HEALTH_CASH_FEED_METHOD`

### Ranking
- `CEREBRAS_API_KEY`
- `CEREBRAS_API_KEY_2`
- `COHERE_API_KEY`
- `COHERE_API_KEY_2`
- `COHERE_API_KEY_3`
- `COHERE_API_KEY_4`

Feed URL templates can use `{code}`, `{procedure}`, `{location}`, `{lat}`, `{lon}`, and `{radius}` placeholders.

## Leadership brief

After a quote analysis, the Reports section produces a print-ready report with:

- provider quote
- source-balanced self-pay median
- dollar and percentage variance
- market and radius
- source-by-source medians and ranges
- methodology and exclusions
- required source attribution/notes when returned by the feed

Use **Print / Save PDF** to create the final PDF through the browser print workflow.
