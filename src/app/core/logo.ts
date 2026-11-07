/**
 * Company logos for jobs whose source gives none (the backup job lists have no logo field).
 * The logo is looked up from the company's website: the name is turned into likely web addresses and the
 * favicon service is asked for a big icon. The card only keeps an icon that really loads and is not the plain
 * default globe; otherwise it shows a coloured initial.
 */
const COMPANY_WORDS = /\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|group|holdings|technologies|technology|labs|software|solutions|plc|pty|the)\b\.?/gi;

/** Likely web addresses of a company, most likely first. */
export function domainGuesses(company: string): string[] {
  const name = (company ?? '').trim().toLowerCase();
  if (!name) {
    return [];
  }
  const asDomain = name.replace(/\s+/g, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(asDomain)) {
    return [asDomain]; // "Silver.dev", "Lemon.io": the name already is the address
  }
  const slug = name.replace(COMPANY_WORDS, ' ').replace(/[^a-z0-9]/g, '');
  if (slug.length < 3) {
    return [];
  }
  return [`${slug}.com`, `${slug}.io`, `${slug}.ai`, `${slug}.co`, `${slug}.dev`];
}

/** The icon of a website at a large size. */
export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/** Websites that are never the company's own (job sites, social networks, application systems). */
const NOT_THE_COMPANY =
  /(remoteok|remotive|jobicy|himalayas|arbeitnow|linkedin|facebook|twitter|\bx\.com|instagram|youtube|youtu\.be|github|google|apple|microsoft|amazonaws|greenhouse|lever\.co|workable|ashbyhq|bamboohr|smartrecruiters|workday|recruitee|jobvite|icims|indeed|glassdoor|notion|calendly|zoom|medium|wikipedia|w3\.org|bit\.ly|tinyurl|typeform|forms\.)/i;

const COMPANY_SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|group|holdings|technologies|technology|labs|software|solutions|plc|pty|the)\b\.?/gi;

/** The company's own website when the job text mentions it (a link whose address contains the company name). */
export function domainFromText(html: string, company: string): string | null {
  const slug = (company ?? '').toLowerCase().replace(COMPANY_SUFFIX, ' ').replace(/[^a-z0-9]/g, '');
  if (slug.length < 3) {
    return null;
  }
  const key = slug.slice(0, 8);
  const found = [...(html ?? '').matchAll(/https?:\/\/(?:www\.)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
  return found.find((d) => !NOT_THE_COMPANY.test(d) && d.replace(/[^a-z0-9]/g, '').includes(key)) ?? null;
}

/**
 * Where to look for a company's logo: the website named in the job text first (sure), then guesses from the name.
 * A sure address is accepted with a smaller icon than a guess.
 */
export function logoCandidates(company: string, description = ''): { domain: string; sure: boolean }[] {
  const fromText = domainFromText(description, company);
  const list = (fromText ? [{ domain: fromText, sure: true }] : []).concat(domainGuesses(company).filter((d) => d !== fromText).map((domain) => ({ domain, sure: false })));
  return list;
}
