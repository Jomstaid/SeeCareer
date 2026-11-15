import { titleMatches } from './webphoto';

export interface WebPage {
  title: string;
  url: string;
  text: string;
}

const wantsWeb =
  /\b(search|look ?(it )?up|google|internet|online|on the web|wikipedia|latest|news|current(ly)?|recent(ly)?|today|who (is|was|are)|where is|when (did|was)|what is the (capital|population|price|salary)|find out|tell me about|how old is)\b/i;

export function needsWeb(text: string): boolean {
  return wantsWeb.test(text ?? '');
}

export function searchQuery(text: string): string {
  return (text ?? '')
    .replace(/\b(please|can you|could you|hey|hi|ai|search|look ?(it )?up|google|on the (internet|web)|online|on wikipedia|wikipedia|find out|tell me|about|for me|who (is|was|are)|what is|where is|when (did|was)|how old is|the latest|latest|news|and)\b/gi, ' ')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function parsePages(data: unknown): WebPage[] {
  const pages = Object.values((data as { query?: { pages?: Record<string, { index?: number; title: string; extract?: string; fullurl?: string }> } })?.query?.pages ?? {});
  return pages
    .sort((a, b) => (a.index ?? 9) - (b.index ?? 9))
    .filter((p) => (p.extract ?? '').length > 60)
    .map((p) => ({ title: p.title, url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, text: (p.extract ?? '').trim() }));
}

export async function webLookup(query: string): Promise<WebPage[]> {
  const q = query.trim();
  if (q.length < 3) {
    return [];
  }
  try {
    const api =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3' +
      `&gsrsearch=${encodeURIComponent(q)}&prop=extracts|info&exintro=1&explaintext=1&exchars=1400&inprop=url`;
    const res = await fetch(api);
    return res.ok ? parsePages(await res.json()) : [];
  } catch {
    return [];
  }
}

export async function personFacts(name: string): Promise<WebPage | null> {
  const [first] = await webLookup(name);
  return first && titleMatches(name, first.title) && first.text.length > 200 ? first : null;
}

export function webContext(pages: WebPage[]): string {
  return pages.map((p, i) => `[${i + 1}] ${p.title} (${p.url})\n${p.text}`).join('\n\n');
}
