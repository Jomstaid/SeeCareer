/** Countries (and well-known cities) a user may name when asking for jobs "in" a place. */
export interface Place {
  /** Name shown to the user, for example "Philippines". */
  label: string;
  /** ISO 3166 two-letter code used by the jobs API. */
  code: string;
  /** A city or province the user named inside that country, for example "Nueva Ecija". */
  city?: string;
}

const COUNTRIES: [string, string, string[]][] = [
  ['Philippines', 'PH', ['philippines', 'philippine', 'pilipinas', 'ph', 'manila', 'quezon city', 'cebu', 'davao', 'makati', 'taguig', 'pasig', 'cavite', 'laguna', 'baguio', 'nueva ecija', 'cabanatuan', 'pampanga', 'iloilo', 'luzon', 'mindanao', 'visayas']],
  ['United States', 'US', ['united states', 'usa', 'u.s.', 'america', 'us', 'new york', 'california', 'texas', 'florida', 'san francisco', 'los angeles', 'chicago', 'seattle', 'austin']],
  ['United Kingdom', 'GB', ['united kingdom', 'uk', 'u.k.', 'england', 'britain', 'great britain', 'london', 'manchester', 'scotland']],
  ['Canada', 'CA', ['canada', 'toronto', 'vancouver', 'montreal', 'ontario']],
  ['Australia', 'AU', ['australia', 'sydney', 'melbourne', 'brisbane']],
  ['New Zealand', 'NZ', ['new zealand', 'auckland']],
  ['India', 'IN', ['india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai']],
  ['Singapore', 'SG', ['singapore']],
  ['Malaysia', 'MY', ['malaysia', 'kuala lumpur']],
  ['Indonesia', 'ID', ['indonesia', 'jakarta', 'bali']],
  ['Vietnam', 'VN', ['vietnam', 'viet nam', 'hanoi', 'ho chi minh']],
  ['Thailand', 'TH', ['thailand', 'bangkok']],
  ['Japan', 'JP', ['japan', 'tokyo', 'osaka']],
  ['South Korea', 'KR', ['south korea', 'korea', 'seoul']],
  ['China', 'CN', ['china', 'beijing', 'shanghai', 'shenzhen']],
  ['Hong Kong', 'HK', ['hong kong']],
  ['Pakistan', 'PK', ['pakistan', 'karachi', 'lahore']],
  ['Bangladesh', 'BD', ['bangladesh', 'dhaka']],
  ['Sri Lanka', 'LK', ['sri lanka', 'colombo']],
  ['United Arab Emirates', 'AE', ['united arab emirates', 'uae', 'dubai', 'abu dhabi']],
  ['Saudi Arabia', 'SA', ['saudi arabia', 'saudi', 'riyadh']],
  ['Israel', 'IL', ['israel', 'tel aviv']],
  ['Turkey', 'TR', ['turkey', 'turkiye', 'istanbul']],
  ['Egypt', 'EG', ['egypt', 'cairo']],
  ['Nigeria', 'NG', ['nigeria', 'lagos']],
  ['Kenya', 'KE', ['kenya', 'nairobi']],
  ['South Africa', 'ZA', ['south africa', 'cape town', 'johannesburg']],
  ['Germany', 'DE', ['germany', 'deutschland', 'berlin', 'munich']],
  ['France', 'FR', ['france', 'paris']],
  ['Spain', 'ES', ['spain', 'madrid', 'barcelona']],
  ['Portugal', 'PT', ['portugal', 'lisbon']],
  ['Italy', 'IT', ['italy', 'rome', 'milan']],
  ['Netherlands', 'NL', ['netherlands', 'holland', 'amsterdam']],
  ['Belgium', 'BE', ['belgium', 'brussels']],
  ['Ireland', 'IE', ['ireland', 'dublin']],
  ['Poland', 'PL', ['poland', 'warsaw']],
  ['Sweden', 'SE', ['sweden', 'stockholm']],
  ['Norway', 'NO', ['norway', 'oslo']],
  ['Denmark', 'DK', ['denmark', 'copenhagen']],
  ['Finland', 'FI', ['finland', 'helsinki']],
  ['Switzerland', 'CH', ['switzerland', 'zurich']],
  ['Brazil', 'BR', ['brazil', 'brasil', 'sao paulo']],
  ['Argentina', 'AR', ['argentina', 'buenos aires']],
  ['Mexico', 'MX', ['mexico', 'mexico city']],
  ['Colombia', 'CO', ['colombia', 'bogota']],
  ['Chile', 'CL', ['chile', 'santiago']],
];

const SHORT_OK = /\b(?:in|from|at|near|within)\s+$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds a place named in the text ("developer jobs in Manila", "work from Philippines").
 * Returns the place and the text with the place (and the "in/near/from" before it) taken out, ready to use as a job keyword.
 */
export function splitPlace(text: string): { query: string; place: Place | null } {
  const lower = text.toLowerCase();
  let best: { label: string; code: string; alias: string } | null = null;
  for (const [label, code, aliases] of COUNTRIES) {
    for (const alias of aliases) {
      const m = new RegExp(`(?<![a-z])${escape(alias)}(?![a-z])`).exec(lower);
      if (!m) {
        continue;
      }
      // short words like "us" or "ph" only count right after "in", "from"...
      if (alias.length <= 2 && !SHORT_OK.test(lower.slice(0, m.index))) {
        continue;
      }
      if (!best || alias.length > best.alias.length) {
        best = { label, code, alias };
      }
    }
  }
  if (!best) {
    return { query: text.trim(), place: null };
  }
  const phrase = new RegExp(
    `\\s*(?:\\b(?:based\\s+)?(?:in|at|near|around|from|within|for)\\s+(?:the\\s+)?)?(?<![a-z])${escape(best.alias)}(?![a-z])(?:\\s*,\\s*[a-z .]+)?`,
    'i',
  );
  const cleaned = text
    .replace(phrase, ' ')
    .replace(/\b(?:please|find me|find|show me|search for|search|looking for|i want|i need|jobs?|work|hiring|openings?|positions?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const country = new Set([best.label.toLowerCase(), best.code.toLowerCase(), 'philippine', 'pilipinas', 'usa', 'u.s.', 'america', 'uk', 'u.k.', 'britain', 'great britain', 'deutschland', 'holland', 'brasil', 'turkiye', 'viet nam', 'uae']);
  // the most specific place named: a city or province, not the country itself
  let city: string | undefined;
  for (const [label, , aliases] of COUNTRIES) {
    if (label !== best.label) {
      continue;
    }
    for (const alias of aliases) {
      if (!country.has(alias) && alias.length > 3 && new RegExp(`(?<![a-z])${escape(alias)}(?![a-z])`).test(lower) && (!city || alias.length > city.length)) {
        city = alias;
      }
    }
  }
  const pretty = city?.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return { query: cleaned, place: { label: best.label, code: best.code, ...(pretty ? { city: pretty } : {}) } };
}

/** A place from a name or code the AI gave ("Philippines", "PH", "Manila, Philippines"). */
export function placeFromName(name: string, code = ''): Place | null {
  const fromCode = COUNTRIES.find(([, c]) => c === code.trim().toUpperCase());
  if (fromCode) {
    const city = name.trim() ? splitPlace(`in ${name}`).place?.city : undefined;
    return { label: fromCode[0], code: fromCode[1], ...(city ? { city } : {}) };
  }
  return name.trim() ? splitPlace(`in ${name}`).place : null;
}

/** The country with this two-letter code, or null. */
export function placeByCode(code: string): Place | null {
  const c = COUNTRIES.find(([, k]) => k === (code ?? '').trim().toUpperCase());
  return c ? { label: c[0], code: c[1] } : null;
}
