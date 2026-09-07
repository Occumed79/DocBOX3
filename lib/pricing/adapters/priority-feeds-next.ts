import type { LicensedCashFeedSearch } from './licensed-cash-feed';
import { isTurquoiseConfigured, searchTurquoiseCash } from './turquoise';

export const PRIORITY_FEED_STATUS = [
  { id: 'turquoise-health', name: 'Turquoise Health', configured: isTurquoiseConfigured() },
];

export function searchTurquoiseRawCash(search: LicensedCashFeedSearch) {
  return searchTurquoiseCash({
    procedureCode: search.procedureCode,
    procedureName: search.procedureName,
    postalCode: undefined,
    latitude: search.latitude,
    longitude: search.longitude,
    radiusMiles: search.radiusMiles,
  });
}
