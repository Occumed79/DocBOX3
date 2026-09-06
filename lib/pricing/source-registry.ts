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
  'cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash',
]);

export function isEligibleSelfPayBasis(value: string | null | undefined): value is EligiblePaymentBasis {
  return Boolean(value && ELIGIBLE_SELF_PAY_BASES.has(value as EligiblePaymentBasis));
}

export type ProvenanceFamily =
  | 'hospital_mrf_cash'
  | 'provider_verified_quote'
  | 'provider_published_cash'
  | 'direct_pay_marketplace'
  | 'imaging_clinic_cash'
  | 'dental_observed_cash'
  | 'lab_direct_purchase'
  | 'mixed_cash'
  | 'unknown_cash';

const SOURCE_PROVENANCE_FAMILY: Record<string, ProvenanceFamily> = {
  'turquoise-health': 'hospital_mrf_cash',
  'hospital-ledger': 'hospital_mrf_cash',
  'price-transparency': 'hospital_mrf_cash',
  'medrates': 'hospital_mrf_cash',
  'medcompare': 'hospital_mrf_cash',
  'fairvisit-health': 'hospital_mrf_cash',
  'loa': 'provider_verified_quote',
  'marketcare': 'provider_verified_quote',
  'solv-clearprice': 'provider_verified_quote',
  'directmedicine': 'provider_published_cash',
  'dentalprice': 'provider_published_cash',
  'expected-health': 'imaging_clinic_cash',
  'radiology-assist': 'direct_pay_marketplace',
  'mdsave': 'direct_pay_marketplace',
  'sesame': 'direct_pay_marketplace',
  'testwell': 'lab_direct_purchase',
  'labtestinsight': 'lab_direct_purchase',
  'real-dental-costs': 'dental_observed_cash',
  'sumhealth': 'mixed_cash',
  'dentaquote': 'dental_observed_cash',
};

export function provenanceFamilyForSource(sourceId: string): ProvenanceFamily {
  return SOURCE_PROVENANCE_FAMILY[sourceId] || 'unknown_cash';
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
  provenanceFamily?: ProvenanceFamily;
  integration?: 'oauth-api' | 'open-api' | 'public-csv' | 'public-page' | 'candidate-feed';
  occumedRelevance?: string;
};

export const PRICING_SOURCES: PricingSource[] = [
  {
    id: 'turquoise-health', name: 'Turquoise Health', category: 'core', status: 'approved', integration: 'oauth-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'OAuth API queried only with pricing.type=cash; every returned row is rechecked as cash and payer/network rows are rejected.',
    coverage: 'National hospital/facility cash transparency data.',
    eligibleLabels: ['cash', 'discounted cash', 'provider-published self-pay'],
    excludedLabels: ['negotiated', 'payer-specific', 'claims-derived', 'Medicare', 'gross charge'],
    occumedRelevance: 'Imaging, cardiology, diagnostics, hospital/facility procedures.',
  },
  {
    id: 'hospital-ledger', name: 'Hospital Ledger', category: 'core', status: 'approved', integration: 'open-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'CC0 standardized hospital MRF data. Only explicit cash/self-pay fields are eligible.',
    coverage: '3,000+ hospitals with standardized rows and thousands of CPT/HCPCS codes.',
    eligibleLabels: ['cash', 'discounted cash', 'self-pay'], excludedLabels: ['gross', 'negotiated', 'insurance', 'unknown'],
    occumedRelevance: 'Hospital imaging, diagnostics, cardiology and other ordered services.',
  },
  {
    id: 'price-transparency', name: 'PriceTransparency.io', category: 'core', status: 'approved', integration: 'open-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'Public hospital pricing API queried with rate_type=cash only.',
    coverage: 'National hospital CPT/HCPCS cash rows; anonymous API access.',
    eligibleLabels: ['rate_type=cash'], excludedLabels: ['gross', 'negotiated', 'min', 'max', 'payer'],
    occumedRelevance: 'Facility-level imaging, stress testing, diagnostics and other shoppable services.',
  },
  {
    id: 'marketcare', name: 'MarketCare', category: 'cash-data', status: 'approved', integration: 'public-page', provenanceFamily: 'provider_verified_quote',
    description: 'Real provider cash quotes captured by phone or provider-published cash menus; public Austin procedure index.',
    coverage: 'Austin, Texas; hundreds of procedures including stress testing, EKG, physicals, labs, imaging and dental.',
    eligibleLabels: ['phone-verified cash quote', 'provider cash menu'], excludedLabels: ['hospital comparison price', 'partial quote'],
    occumedRelevance: 'Extremely high for treadmill stress tests, EKG, physicals, imaging, labs and dental.',
  },
  {
    id: 'solv-clearprice', name: 'Solv ClearPrice', category: 'cash-data', status: 'approved', integration: 'public-page', provenanceFamily: 'provider_verified_quote',
    description: 'Self-pay prices submitted and verified by participating urgent-care and walk-in clinics.',
    coverage: 'Large U.S. urgent-care footprint; physicals, X-rays, flu shots, office visits and testing.',
    eligibleLabels: ['verified self-pay', 'cash'], excludedLabels: ['insurance', 'unknown'],
    occumedRelevance: 'High for physicals, vaccines, X-rays and clinic-level self-pay comparisons.',
  },
  {
    id: 'expected-health', name: 'Expected Health', category: 'cash-data', status: 'approved', integration: 'public-csv', provenanceFamily: 'imaging_clinic_cash',
    description: 'Quarterly metro imaging index built from self-pay prices published by independent imaging clinics.',
    coverage: 'National and metro MRI, CT, X-ray, ultrasound, mammography, DEXA, PET and nuclear medicine.',
    eligibleLabels: ['clinic-published cash', 'self-pay'], excludedLabels: ['insurance', 'claims estimate'],
    occumedRelevance: 'Very high for CXR, MRI/CT/ultrasound and other referred imaging.',
  },
  {
    id: 'radiology-assist', name: 'RadiologyAssist', category: 'marketplace', status: 'approved', integration: 'public-page', provenanceFamily: 'direct_pay_marketplace',
    description: 'Actual self-pay imaging rates available when scheduled and prepaid through RadiologyAssist.',
    coverage: 'Nationwide MRI, CT, PET, ultrasound, X-ray, mammography and DEXA.',
    eligibleLabels: ['marketplace cash', 'prepaid self-pay'], excludedLabels: ['insurance estimate'],
    occumedRelevance: 'Very high for imaging price comparison and alternate self-pay access.',
  },
  {
    id: 'testwell', name: 'TestWell', category: 'marketplace', status: 'approved', integration: 'open-api', provenanceFamily: 'lab_direct_purchase',
    description: 'No-auth public catalog of direct-purchase lab tests with CPT-linked pricing.',
    coverage: '49 states + DC/Puerto Rico; 100+ tests performed through major labs.',
    eligibleLabels: ['direct-pay test price'], excludedLabels: ['hospital comparison estimate', 'insurance'],
    occumedRelevance: 'High for CBC, CMP, A1c, lipids and other routine lab benchmark checks.',
  },
  {
    id: 'labtestinsight', name: 'LabTestInsight', category: 'cash-data', status: 'approved', integration: 'public-page', provenanceFamily: 'lab_direct_purchase',
    description: 'Quarterly index of advertised direct-pay laboratory prices recorded from provider public pricing pages.',
    coverage: 'Common blood panels, drug testing, PSA, A1c and other frequently ordered tests.',
    eligibleLabels: ['advertised direct-pay', 'source-verified cash'], excludedLabels: ['insurance', 'modeled price'],
    occumedRelevance: 'High for lab and drug-testing quote sanity checks.',
  },
  {
    id: 'real-dental-costs', name: 'Real Dental Costs', category: 'dental', status: 'approved', integration: 'open-api', provenanceFamily: 'dental_observed_cash',
    description: 'Open dental index; only rows whose basis is explicitly observed are accepted. Modeled bands and Medicaid/insurance data are rejected.',
    coverage: 'State-level observed data for a limited set of dental procedure families.',
    eligibleLabels: ['basis=observed'], excludedLabels: ['estimated', 'national modeled', 'Medicaid', 'insurance'],
    occumedRelevance: 'Useful fallback for dental exams and selected common dental procedure families.',
  },
  {
    id: 'dentalprice', name: 'DENTALPRICE', category: 'dental', status: 'approved', integration: 'public-page', provenanceFamily: 'provider_published_cash',
    description: 'Cash/self-pay dental prices listed directly by dentists.',
    coverage: 'Growing U.S. city/ZIP coverage.',
    eligibleLabels: ['dentist-posted cash', 'self-pay'], excludedLabels: ['insurance', 'typical U.S. range when no dentist price exists'],
    occumedRelevance: 'High for comprehensive exam, panoramic/bitewing X-rays and related dental quotes when listed.',
  },
  {
    id: 'directmedicine', name: 'DirectMedicine', category: 'cash-data', status: 'approved', integration: 'public-page', provenanceFamily: 'provider_published_cash',
    description: 'Cash-pay provider directory where practices publish service prices.',
    coverage: 'Growing national direct-pay provider directory.',
    eligibleLabels: ['provider-published cash'], excludedLabels: ['insurance estimate', 'unpriced listing'],
    occumedRelevance: 'Useful for office visits, physicals and directly published outpatient service prices.',
  },
  {
    id: 'mdsave', name: 'MDsave', category: 'marketplace', status: 'approved', integration: 'public-page', provenanceFamily: 'direct_pay_marketplace',
    description: 'Purchasable prepaid cash procedure packages; kept separate from provider-posted cash.',
    coverage: 'Broad U.S. participating-provider network.',
    eligibleLabels: ['marketplace cash', 'cash package'], excludedLabels: ['insurance estimate'],
    occumedRelevance: 'Relevant for imaging, diagnostics and other prepaid shoppable services.',
  },
  {
    id: 'sesame', name: 'Sesame', category: 'marketplace', status: 'approved', integration: 'public-page', provenanceFamily: 'direct_pay_marketplace',
    description: 'Direct-pay marketplace prices for outpatient care.',
    coverage: 'National in-person and virtual provider marketplace.',
    eligibleLabels: ['direct pay', 'marketplace cash'], excludedLabels: ['insurance estimate'],
    occumedRelevance: 'Useful supporting context for outpatient visits and selected direct-pay services.',
  },
  {
    id: 'sumhealth', name: 'SumHealth', category: 'cash-data', status: 'candidate', integration: 'candidate-feed', provenanceFamily: 'mixed_cash',
    description: 'Hospital cash MRF plus provider-submitted cash prices; only explicit cash fields may be admitted and provenance must remain separate.',
    coverage: 'National hospital coverage with growing provider-submitted pricing.',
    eligibleLabels: ['cash', 'provider-submitted cash'], excludedLabels: ['negotiated', 'gross', 'insurance'],
    occumedRelevance: 'Useful as a verification/fallback source for medical self-pay pricing.',
  },
  {
    id: 'fairvisit-health', name: 'FairVisitHealth', category: 'cash-data', status: 'approved', integration: 'open-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'Hospital-published discounted cash values only; Medicare fields and nonlocal fallbacks are ignored.',
    coverage: 'National hospital cash-price lookup.',
    eligibleLabels: ['discounted cash'], excludedLabels: ['Medicare', 'negotiated', 'national fallback for local benchmark'],
    occumedRelevance: 'Imaging and hospital/facility diagnostic comparison.',
  },
  {
    id: 'loa', name: 'Loa', category: 'cash-data', status: 'approved', integration: 'open-api', provenanceFamily: 'provider_verified_quote',
    description: 'Source-labeled healthcare price rows resolved to local entities; only explicit cash/discounted-cash/package-cash rows are accepted.',
    coverage: 'U.S. provider/facility pricing where source-labeled rows are available.',
    eligibleLabels: ['cash', 'discounted cash', 'provider-verified self-pay'], excludedLabels: ['negotiated', 'generic MRF row', 'insurance', 'Medicare', 'Medicaid'],
    occumedRelevance: 'Broad provider/facility support where cash rows are available.',
  },
  {
    id: 'medcompare', name: 'MedCompare', category: 'cash-data', status: 'candidate', integration: 'open-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'Hospital transparency source; only explicit discounted-cash fields are eligible.',
    coverage: 'National hospital/facility data.', eligibleLabels: ['cash', 'discounted cash'], excludedLabels: ['Medicare', 'negotiated', 'gross'],
    occumedRelevance: 'Verification/fallback for facility-based services.',
  },
  {
    id: 'medrates', name: 'MedRates.fyi', category: 'cash-data', status: 'candidate', integration: 'open-api', provenanceFamily: 'hospital_mrf_cash',
    description: 'Normalized hospital pricing files; only explicit cash/self-pay results are eligible.',
    coverage: 'National hospital data.', eligibleLabels: ['cash price', 'self pay'], excludedLabels: ['commercial', 'Medicare', 'Medicaid', 'gross'],
    occumedRelevance: 'Verification/fallback for hospital-based services.',
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
