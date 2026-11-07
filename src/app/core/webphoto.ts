/**
 * Finds a public photo of a well-known person on Wikipedia (free, no key, allows browser requests).
 * The AI itself cannot browse the internet, so the app does this search and hands the picture to the resume.
 */

/** True when a Wikipedia page title is really about this person (at least two name words match). */
export function titleMatches(name: string, title: string): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const wanted = words(name);
  const found = new Set(words(title));
  return wanted.length > 0 && wanted.filter((w) => found.has(w)).length >= Math.min(2, wanted.length);
}

/** A placeholder name such as "[Your Name]" is not a person to search for. */
export function isSearchableName(name: string): boolean {
  return !!name && !/[[\]]|your name/i.test(name) && name.trim().split(/\s+/).length >= 2;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the picture.'));
    reader.readAsDataURL(blob);
  });
}

/** The lead picture of the person's Wikipedia page as a data URL, or null when there is no clear match. */
export async function findWebPhoto(name: string): Promise<string | null> {
  if (!isSearchableName(name)) {
    return null;
  }
  try {
    const api =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3' +
      `&gsrsearch=${encodeURIComponent(name)}&prop=pageimages&piprop=thumbnail&pithumbsize=640`;
    const res = await fetch(api);
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { query?: { pages?: Record<string, { index?: number; title: string; thumbnail?: { source: string } }> } };
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 9) - (b.index ?? 9));
    const page = pages.find((p) => p.thumbnail?.source && titleMatches(name, p.title));
    if (!page?.thumbnail) {
      return null;
    }
    const img = await fetch(page.thumbnail.source);
    if (!img.ok) {
      return null;
    }
    const blob = await img.blob();
    if (!blob.type.startsWith('image/') || blob.size > 3_000_000) {
      return null;
    }
    return await toDataUrl(blob);
  } catch {
    return null;
  }
}
