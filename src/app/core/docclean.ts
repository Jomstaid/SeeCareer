const PICTOGRAPHS = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

const LEAD = /^(sure|certainly|of course|absolutely|okay|ok|great|happy to|here('s| is| are)|below is|i('ll| will| can| have)|let me)\b/i;

const TAIL =
  /^(let me know|would you like|want me to|do you want|feel free|if you('d| would) like|i hope|hope this|need any|just share|share (your|these)|you can also|note:|tip:|p\.s\.|honest note|assumption|heads up|disclaimer)/i;

export function stripChatter(text: string): string {
  let t = (text ?? '').replace(/\r\n/g, '\n').replace(PICTOGRAPHS, '').trim();
  t = t.replace(/^```(?:markdown|md|text)?[ \t]*\n/i, '').replace(/\n```[ \t]*$/, '').trim();

  let lines = t.split('\n');

  const heading = lines.findIndex((l) => /^#{1,3}\s/.test(l));
  if (heading > 0) {
    const preface = lines.slice(0, heading).join('\n').trim();
    const firstWords = lines.find((l) => l.trim())?.trim() ?? '';
    if (preface.length < 700 && (LEAD.test(firstWords) || /[:!]\s*$/.test(firstWords))) {
      lines = lines.slice(heading);
    }
  }

  const blank = (l?: string) => !l || !l.trim() || /^[-*_]{3,}$/.test(l.trim());
  while (lines.length && blank(lines[0])) {
    lines.shift();
  }
  if (lines[0] && LEAD.test(lines[0].trim()) && /[:!]\s*$/.test(lines[0].trim())) {
    lines.shift();
  }
  if (lines[0] && /^(assumption|note|honest note)\s*[:\-]/i.test(lines[0].trim().replace(/^[>*_\s]+/, ''))) {
    while (lines.length && lines[0].trim()) {
      lines.shift();
    }
  }
  while (lines.length && blank(lines[0])) {
    lines.shift();
  }

  const isTail = (l: string) => TAIL.test(l.trim().replace(/^[>*_\-\s]+/, ''));
  let last = -1;
  for (let i = lines.length - 1; i >= Math.floor(lines.length * 0.5); i--) {
    if (isTail(lines[i])) {
      last = i;
      break;
    }
  }
  if (last >= 0) {
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

export function titleOf(markdown: string): string | undefined {
  return /^#{1,2}\s+(.+)$/m.exec(markdown)?.[1]?.replace(/[*_`]/g, '').trim();
}

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

export function isLetterRequest(request: string): boolean {
  return /\b(letter|e-?mail)\b/i.test(request ?? '');
}

export function letterize(markdown: string): string {
  return (markdown ?? '')
    .split('\n')
    .filter((l) => !/^#{1,6}\s/.test(l.trim()) && !/^[-*_]{3,}$/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
