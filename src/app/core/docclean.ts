/** Emoji and pictographs: they do not belong in a professional document and most fonts cannot draw them. */
const PICTOGRAPHS = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

/** Openers such as "Sure! Here is your letter:" that the AI puts before a document. */
const LEAD = /^(sure|certainly|of course|absolutely|okay|ok|great|happy to|here('s| is| are)|below is|i('ll| will| can| have)|let me)\b/i;

/** Closers such as "Want me to customize this?" that the AI puts after a document. */
const TAIL =
  /^(let me know|would you like|want me to|do you want|feel free|if you('d| would) like|i hope|hope this|need any|just share|share (your|these)|you can also|note:|tip:|p\.s\.)/i;

/**
 * Removes the chat around a document the AI wrote: greetings before it, offers and questions after it,
 * a wrapping code fence, and emoji. What is left is only the document itself.
 */
export function stripChatter(text: string): string {
  let t = (text ?? '').replace(/\r\n/g, '\n').replace(PICTOGRAPHS, '').trim();
  t = t.replace(/^```(?:markdown|md|text)?[ \t]*\n/i, '').replace(/\n```[ \t]*$/, '').trim();

  let lines = t.split('\n');

  // before the first heading: a short chatty preface is dropped
  const heading = lines.findIndex((l) => /^#{1,3}\s/.test(l));
  if (heading > 0) {
    const preface = lines.slice(0, heading).join('\n').trim();
    const firstWords = lines.find((l) => l.trim())?.trim() ?? '';
    if (preface.length < 700 && (LEAD.test(firstWords) || /[:!]\s*$/.test(firstWords))) {
      lines = lines.slice(heading);
    }
  }

  // after the document: the closing offers and questions ("Want me to...? Just share: 1. ...")
  const isTail = (l: string) => TAIL.test(l.trim().replace(/^[>*_\-\s]+/, ''));
  let last = -1;
  for (let i = lines.length - 1; i >= Math.floor(lines.length * 0.5); i--) {
    if (isTail(lines[i])) {
      last = i;
      break;
    }
  }
  if (last >= 0) {
    // walk up through the rest of that closing block (more offers, blank lines, a divider)
    let cut = last;
    while (cut > 0 && (!lines[cut - 1].trim() || /^[-*_]{3,}$/.test(lines[cut - 1].trim()) || isTail(lines[cut - 1]))) {
      cut--;
    }
    if (lines.slice(cut).join('\n').length < 700) {
      lines = lines.slice(0, cut);
    }
  }
  return lines.join('\n').trim();
}

/** The document's own title: its first heading. */
export function titleOf(markdown: string): string | undefined {
  return /^#{1,2}\s+(.+)$/m.exec(markdown)?.[1]?.replace(/[*_`]/g, '').trim();
}

/** A short readable title from the request, for example "write me a cover letter for a nurse job as pdf" -> "Cover letter for a nurse job". */
export function nameFromRequest(request: string): string {
  const words = (request ?? '')
    .replace(/\b(as|in|to|into)\s+(a\s+)?(pdf|word|docx?|ms word|txt|text file|markdown)\b/gi, '')
    .replace(/\b(please|can you|could you|i need|i want|create|make|write|draft|prepare|generate|build|me|for me|a|an|the|some|my|it|this|that|these|those)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 9);
  while (words.length > 1 && /^(at|for|in|of|to|and|with|on|by)$/i.test(words[words.length - 1])) {
    words.pop();
  }
  if (!words.length) {
    return `SeeCareer ${new Date().toISOString().slice(0, 10)}`;
  }
  const title = words.join(' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** A request for a letter or an email (these have no title and no section headings). */
export function isLetterRequest(request: string): boolean {
  return /\b(letter|e-?mail)\b/i.test(request ?? '');
}

/**
 * Turns an AI answer into a real letter: no title, no section headings, no divider lines.
 * The sender block, date, recipient, greeting, paragraphs and closing stay as they are.
 */
export function letterize(markdown: string): string {
  return (markdown ?? '')
    .split('\n')
    .filter((l) => !/^#{1,6}\s/.test(l.trim()) && !/^[-*_]{3,}$/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
