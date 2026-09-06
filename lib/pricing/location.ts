const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', dc: 'DC',
};

const VALID_CODES = new Set(Object.values(STATE_CODES));

export function stateCodeFromLocation(location?: string | null): string | null {
  if (!location) return null;
  const upper = location.toUpperCase();
  const codeMatch = upper.match(/(?:^|[\s,])([A-Z]{2})(?:\s|,|\d|$)/);
  if (codeMatch && VALID_CODES.has(codeMatch[1])) return codeMatch[1];

  const lower = location.toLowerCase();
  for (const [name, code] of Object.entries(STATE_CODES)) {
    if (new RegExp(`\\b${name.replace(' ', '\\s+')}\\b`, 'i').test(lower)) return code;
  }
  return null;
}
