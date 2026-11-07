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
