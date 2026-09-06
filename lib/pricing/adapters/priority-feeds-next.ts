import { isLicensedCashFeedConfigured, searchLicensedCashFeed, type LicensedCashFeedSearch } from './licensed-cash-feed';
import { isTurquoiseConfigured, searchTurquoiseCash } from './turquoise';

const CLEARHEALTHCOSTS = {
  sourceId: 'clear-health-costs', sourceName: 'ClearHealthCosts',
  endpoint: process.env.CLEARHEALTHCOSTS_API_URL,
  token: process.env.CLEARHEALTHCOSTS_API_KEY,
  tokenHeader: process.env.CLEARHEALTHCOSTS_API_KEY_HEADER,
  method: (process.env.CLEARHEALTHCOSTS_API_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
  explicitCashFields: ['cash_price', 'self_pay_price', 'selfpay_price', 'uninsured_cash_price', 'discounted_cash_price'] as const,
};

const FAIR_HEALTH_CASH = {
  sourceId: 'fair-health', sourceName: 'FAIR Health',
  endpoint: process.env.FAIR_HEALTH_CASH_FEED_URL,
  token: process.env.FAIR_HEALTH_CASH_FEED_TOKEN,
  tokenHeader: process.env.FAIR_HEALTH_CASH_FEED_TOKEN_HEADER,
  method: (process.env.FAIR_HEALTH_CASH_FEED_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
  explicitCashFields: ['cash_price', 'self_pay_price', 'selfpay_price', 'discounted_cash_price', 'uninsured_cash_price'] as const,
};

export const PRIORITY_FEED_STATUS = [
  { id: CLEARHEALTHCOSTS.sourceId, name: CLEARHEALTHCOSTS.sourceName, configured: isLicensedCashFeedConfigured(CLEARHEALTHCOSTS) },
  { id: 'turquoise-health', name: 'Turquoise Health', configured: isTurquoiseConfigured() },
  { id: FAIR_HEALTH_CASH.sourceId, name: FAIR_HEALTH_CASH.sourceName, configured: isLicensedCashFeedConfigured(FAIR_HEALTH_CASH) },
];

export function searchClearHealthCostsCash(search: LicensedCashFeedSearch) {
  return searchLicensedCashFeed(CLEARHEALTHCOSTS, search);
}

export function searchTurquoiseRawCash(search: LicensedCashFeedSearch) {
  return searchTurquoiseCash({
    procedureCode: search.procedureCode,
    procedureName: search.procedureName,
    latitude: search.latitude,
    longitude: search.longitude,
    radiusMiles: search.radiusMiles,
  });
}

export function searchFairHealthCash(search: LicensedCashFeedSearch) {
  return searchLicensedCashFeed(FAIR_HEALTH_CASH, search);
}
