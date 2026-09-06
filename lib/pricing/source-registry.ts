export type EligiblePaymentBasis =
  | 'cash'
  | 'self_pay'
  | 'discounted_cash'
  | 'uninsured'
  | 'direct_pay'
  | 'marketplace_cash';

export type IneligiblePaymentBasis =
  | 'medicare'
  | 'medicaid'
  | 'commercial_negotiated'
  | 'insurance_allowed'
  | 'insurance_claim'
  | 'claims_average'
  | 'chargemaster'
  | 'gross_charge'
  | 'unknown';

export type PaymentBasis = EligiblePaymentBasis | IneligiblePaymentBasis;

export const ELIGIBLE_SELF_PAY_BASES: ReadonlySet<EligiblePaymentBasis> = new Set([
  'cash',
  'self_pay',
  'discounted_cash',
  'uninsured',
  'direct_pay',
  'marketplace_cash',
]);

export function isEligibleSelfPayBasis(value: string | null | undefined): value is EligiblePaymentBasis {
  return Boolean(value && ELIGIBLE_SELF_PAY_BASES.has(value as EligiblePaymentBasis));
}

export type PricingSource = {
  id: string;
  name: string;
  category: 'core' | 'cash-data' | 'marketplace' | 'dental';
  description: string;
  coverage: string;
  eligibleLabels: string[];
  excludedLabels: string[];
  status: 'approved' | 'candidate';
};

export const PRICING_SOURCES: PricingSource[] = [
  {
    id: 'fair-health',
    name: 'FAIR Health',
    category: 'core',
    description: 'Eligible only when the licensed FAIR Health field or dataset is explicitly identified as cash, self-pay, uninsured, or direct-pay. Claims-derived charge and allowed-amount benchmarks are not self-pay inputs.',
    coverage: 'National medical and dental coverage varies by licensed dataset.',
    eligibleLabels: ['explicit cash dataset', 'self-pay', 'uninsured', 'direct-pay'],
    excludedLabels: ['commercial allowed', 'claims charge benchmark', 'Medicare', 'Medicaid', 'claims-derived estimate'],
    status: 'approved',
  },
  {
    id: 'turquoise-health',
    name: 'Turquoise Health',
    category: 'core',
    description: 'Use only raw provider-published cash / Discounted Cash Price fields from transparency data. Turquoise Consumer Pricing composite estimates are excluded because that methodology can synthesize negotiated rates, claims, and Medicare reference signals.',
    coverage: 'National provider and facility transparency data.',
    eligibleLabels: ['raw discounted cash', 'provider-published cash', 'self-pay MRF field'],
    excludedLabels: ['Consumer Pricing composite', 'negotiated', 'payer-specific', 'claims-derived', 'Medicare reference', 'gross charge'],
    status: 'approved',
  },
  {
    id: 'clear-health-costs',
    name: 'ClearHealthCosts',
    category: 'core',
    description: 'Observed or directly researched cash/self-pay prices.',
    coverage: 'Selected markets and procedures.',
    eligibleLabels: ['cash', 'self-pay'],
    excludedLabels: ['insurance paid', 'insurance allowed', 'unknown'],
    status: 'approved',
  },
  {
    id: 'fairvisit-health',
    name: 'FairVisitHealth',
    category: 'cash-data',
    description: 'Hospital-published discounted cash prices. Local area statistics are eligible only when the API reports a genuinely local scope; Medicare context and state/national fallbacks are discarded.',
    coverage: 'National hospital cash-price API with local ZIP/coordinate lookup.',
    eligibleLabels: ['discounted cash price', 'hospital-published self-pay'],
    excludedLabels: ['Medicare rate', 'negotiated rates', 'national composite', 'state fallback for local benchmark'],
    status: 'approved',
  },
  {
    id: 'medcompare',
    name: 'MedCompare',
    category: 'cash-data',
    description: 'Hospital transparency data with published discounted-cash rates. Only the explicit cash field is eligible.',
    coverage: 'National hospital/facility data.',
    eligibleLabels: ['cash', 'discounted cash', 'self-pay'],
    excludedLabels: ['Medicare', 'negotiated', 'payer rate', 'gross charge'],
    status: 'candidate',
  },
  {
    id: 'medrates',
    name: 'MedRates.fyi',
    category: 'cash-data',
    description: 'Normalized hospital pricing files. Only explicit cash/self-pay results are eligible.',
    coverage: 'National hospital data.',
    eligibleLabels: ['cash price', 'self pay', 'cash discount'],
    excludedLabels: ['commercial', 'Medicare', 'Medicaid', 'gross charge'],
    status: 'candidate',
  },
  {
    id: 'sumhealth',
    name: 'SumHealth',
    category: 'cash-data',
    description: 'Published hospital cash prices plus provider-submitted cash prices.',
    coverage: 'National, with provider coverage growing.',
    eligibleLabels: ['cash price', 'self-pay'],
    excludedLabels: ['negotiated', 'insurance', 'gross charge'],
    status: 'candidate',
  },
  {
    id: 'mdsave',
    name: 'MDsave',
    category: 'marketplace',
    description: 'Purchasable bundled cash prices. Keep classified separately as marketplace cash.',
    coverage: 'Broad U.S. coverage by participating providers.',
    eligibleLabels: ['marketplace cash', 'cash package'],
    excludedLabels: ['insurance estimate'],
    status: 'candidate',
  },
  {
    id: 'opendoc',
    name: 'OpenDoc',
    category: 'marketplace',
    description: 'Cash-pay marketplace pricing and published cash-price ranges.',
    coverage: 'National coverage varies by specialty and service.',
    eligibleLabels: ['cash', 'direct pay', 'marketplace cash'],
    excludedLabels: ['insurance estimate'],
    status: 'candidate',
  },
  {
    id: 'sesame',
    name: 'Sesame',
    category: 'marketplace',
    description: 'Direct-pay marketplace prices where the listed amount is the cash purchase price.',
    coverage: 'U.S. outpatient and virtual/in-person services.',
    eligibleLabels: ['direct pay', 'cash', 'marketplace cash'],
    excludedLabels: ['insurance estimate'],
    status: 'candidate',
  },
  {
    id: 'dentaquote',
    name: 'DentaQuote',
    category: 'dental',
    description: 'Dental price observations derived from patient receipts or treatment plans; use only explicitly self-pay observations.',
    coverage: 'Dental coverage varies by market.',
    eligibleLabels: ['cash', 'self-pay'],
    excludedLabels: ['insurance paid', 'insurance allowed', 'unknown'],
    status: 'candidate',
  },
  {
    id: 'dentalprice',
    name: 'DentalPrice.org',
    category: 'dental',
    description: 'Dentist-posted cash/self-pay dental prices.',
    coverage: 'Dental coverage varies by city and procedure.',
    eligibleLabels: ['cash', 'self-pay'],
    excludedLabels: ['insurance', 'unknown'],
    status: 'candidate',
  },
  {
    id: 'real-dental-costs',
    name: 'Real Dental Costs',
    category: 'dental',
    description: 'Open dental pricing data; retain only records explicitly classified as self-pay.',
    coverage: 'Limited procedure set and geography.',
    eligibleLabels: ['self-pay', 'cash'],
    excludedLabels: ['insurance', 'unknown'],
    status: 'candidate',
  },
];

export type PriceObservationInput = {
  sourceId: string;
  procedureCode: string;
  procedureName: string;
  price: number;
  paymentBasis: PaymentBasis;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  providerName?: string;
  observedAt?: string;
  sourceUrl?: string;
};

export function acceptSelfPayObservation<T extends PriceObservationInput>(record: T): T | null {
  if (!Number.isFinite(record.price) || record.price <= 0) return null;
  if (!isEligibleSelfPayBasis(record.paymentBasis)) return null;
  return record;
}
