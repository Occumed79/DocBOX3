import { isLicensedCashFeedConfigured, searchLicensedCashFeed, type LicensedCashFeedSearch } from './licensed-cash-feed';

const CLEARHEALTHCOSTS = {
  sourceId: 'clear-health-costs',
  sourceName: 'ClearHealthCosts',
  endpoint: process.env.CLEARHEALTHCOSTS_API_URL,
  token: process.env.CLEARHEALTHCOSTS_API_KEY,
  tokenHeader: process.env.CLEARHEALTHCOSTS_API_KEY_HEADER,
  method: (process.env.CLEARHEALTHCOSTS_API_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
  explicitCashFields: ['cash_price', 'self_pay_price', 'selfpay_price', 'uninsured_cash_price', 'discounted_cash_price'] as const,
};

const TURQUOISE_RAW_CASH = {
  sourceId: 'turquoise-health',
  sourceName: 'Turquoise Health',
  endpoint: process.env.TURQUOISE_RAW_CASH_FEED_URL,
  token: process.env.TURQUOISE_RAW_CASH_FEED_TOKEN,
  tokenHeader: process.env.TURQUOISE_RAW_CASH_FEED_TOKEN_HEADER,
  method: (process.env.TURQUOISE_RAW_CASH_FEED_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
  // Intentionally excludes generic estimated_price / total_allowed_amount / negotiated_rate.
  explicitCashFields: ['discounted_cash_price', 'cash_price', 'self_pay_price', 'selfpay_price'] as const,
};

const FAIR_HEALTH_CASH = {
  sourceId: 'fair-health',
  sourceName: 'FAIR Health',
  endpoint: process.env.FAIR_HEALTH_CASH_FEED_URL,
  token: process.env.FAIR_HEALTH_CASH_FEED_TOKEN,
  tokenHeader: process.env.FAIR_HEALTH_CASH_FEED_TOKEN_HEADER,
  method: (process.env.FAIR_HEALTH_CASH_FEED_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
  // Deliberately does not accept out-of-network charge / allowed / claims benchmark fields.
  explicitCashFields: ['cash_price', 'self_pay_price', 'selfpay_price', 'discounted_cash_price', 'uninsured_cash_price'] as const,
};

export const PRIORITY_FEED_STATUS = [
  { id: CLEARHEALTHCOSTS.sourceId, name: CLEARHEALTHCOSTS.sourceName, configured: isLicensedCashFeedConfigured(CLEARHEALTHCOSTS) },
  { id: TURQUOISE_RAW_CASH.sourceId, name: TURQUOISE_RAW_CASH.sourceName, configured: isLicensedCashFeedConfigured(TURQUOISE_RAW_CASH) },
  { id: FAIR_HEALTH_CASH.sourceId, name: FAIR_HEALTH_CASH.sourceName, configured: isLicensedCashFeedConfigured(FAIR_HEALTH_CASH) },
];

export function searchClearHealthCostsCash(search: LicensedCashFeedSearch) {
  return searchLicensedCashFeed(CLEARHEALTHCOSTS, search);
}

export function searchTurquoiseRawCash(search: LicensedCashFeedSearch) {
  return searchLicensedCashFeed(TURQUOISE_RAW_CASH, search);
}

export function searchFairHealthCash(search: LicensedCashFeedSearch) {
  return searchLicensedCashFeed(FAIR_HEALTH_CASH, search);
}
