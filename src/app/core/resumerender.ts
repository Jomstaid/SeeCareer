import type { jsPDF } from 'jspdf';

import { ResumeData, ResumeTemplate, SectionKey, sectionOrder } from './resumedata';

type RGB = [number, number, number];

/** A4 in points. */
const PAGE = { w: 595.28, h: 841.89 };
/**
 * The size the layout is worked out for. It equals PAGE, except when a resume is shrunk to fit one page:
 * the layout is then worked out on a bigger "virtual" page and the whole page is scaled down when it is drawn.
 */
let A4 = { w: PAGE.w, h: PAGE.h };
/** Called whenever a page begins (it starts the scaling when a resume is being shrunk). */
let pageStart: () => void = () => undefined;

// ---------- colour helpers ----------
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(m ? m[1] : '0369a1', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

/** Mixes a colour with white. amount 0 = the colour, 1 = white. */
export function tint(rgb: RGB, amount: number): RGB {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as RGB;
}

/** Mixes a colour with black. amount 0 = the colour, 1 = black. */
export function shade(rgb: RGB, amount: number): RGB {
  return rgb.map((c) => Math.round(c * (1 - amount))) as RGB;
}

function luminance(c: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/** How well white text reads on this colour (WCAG contrast ratio). 4.5 or more is good. */
export function contrastWithWhite(c: RGB): number {
  return 1.05 / (luminance(c) + 0.05);
}

/** Darkens a colour just enough that white text on it stays easy to read. */
export function ensureContrast(hex: string): string {
  let c = hexToRgb(hex);
  for (let i = 0; i < 30 && contrastWithWhite(c) < 4.5; i++) {
    c = shade(c, 0.07);
  }
  return rgbToHex(c);
}

/** Standard PDF fonts only cover Western characters, so replace or drop the rest. */
export function clean(text: string): string {
  return (text ?? '')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●·▪]/g, '-')
    .replace(/→/g, '->')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^ -~ -ÿ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const contactLine = (d: ResumeData): string[] => [d.contact.email, d.contact.phone, d.contact.location, ...d.contact.links].filter(Boolean);

const dash = (parts: (string | undefined)[]) => parts.filter(Boolean).join('  |  ');

// ---------- page flow (handles page breaks) ----------
class Flow {
  page = 1;
  y: number;

  constructor(
    private doc: jsPDF,
    private top: number,
    private bottom: number,
    private decorate: (page: number) => void,
    startY = top,
    startPage = 1,
  ) {
    this.y = startY;
    this.page = startPage;
    if (this.doc.getCurrentPageInfo().pageNumber !== startPage) {
      this.doc.setPage(startPage);
    }
  }

  need(height: number): void {
    if (this.y + height > this.bottom) {
      this.next();
    }
  }

  next(): void {
    this.page++;
    if (this.page > this.doc.getNumberOfPages()) {
      this.doc.addPage();
      pageStart();
      this.decorate(this.page);
    } else {
      this.doc.setPage(this.page);
    }
    this.y = this.top;
  }
}

interface Theme {
  font: 'helvetica' | 'times';
  accent: RGB;
  text: RGB;
  muted: RGB;
  body: number;
  datesRight: boolean;
  heading: (f: Flow, label: string, x: number, w: number) => void;
}

interface TextOpts {
  size: number;
  style?: 'normal' | 'bold' | 'italic';
  color: RGB;
  gap?: number;
  align?: 'left' | 'center' | 'right';
}

function para(doc: jsPDF, f: Flow, t: Theme, text: string, x: number, w: number, o: TextOpts): void {
  const value = clean(text);
  if (!value) {
    return;
  }
  doc.setFont(t.font, o.style ?? 'normal');
  doc.setFontSize(o.size);
  doc.setTextColor(...o.color);
  const lines = doc.splitTextToSize(value, w) as string[];
  const lh = o.size * 1.38;
  for (const line of lines) {
    f.need(lh);
    doc.setFont(t.font, o.style ?? 'normal');
    doc.setFontSize(o.size);
    doc.setTextColor(...o.color);
    const px = o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x;
    doc.text(line, px, f.y + o.size, { align: o.align ?? 'left' });
    f.y += lh;
  }
  f.y += o.gap ?? 0;
}

function bullets(doc: jsPDF, f: Flow, t: Theme, items: string[], x: number, w: number, size: number): void {
  const lh = size * 1.38;
  for (const item of items) {
    const value = clean(item);
    if (!value) {
      continue;
    }
    doc.setFont(t.font, 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, w - 12) as string[];
    lines.forEach((line, i) => {
      f.need(lh);
      if (i === 0) {
        doc.setFillColor(...t.accent);
        doc.circle(x + 3, f.y + size * 0.62, 1.6, 'F');
      }
      doc.setFont(t.font, 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...t.text);
      doc.text(line, x + 12, f.y + size);
      f.y += lh;
    });
    f.y += 1.5;
  }
}

/** Role on the left, dates on the right (or all in one muted line), then the company line. */
function entry(doc: jsPDF, f: Flow, t: Theme, head: string, sub: string, dates: string, x: number, w: number): void {
  const size = t.body + 0.6;
  const lh = size * 1.38;
  f.need(lh * 2 + 4);
  if (t.datesRight && dates) {
    doc.setFont(t.font, 'normal');
    doc.setFontSize(t.body);
    const dw = doc.getTextWidth(clean(dates)) + 10;
    doc.setFont(t.font, 'bold');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(head), w - dw) as string[];
    lines.forEach((line, i) => {
      f.need(lh);
      doc.setFont(t.font, 'bold');
      doc.setFontSize(size);
      doc.setTextColor(...t.text);
      doc.text(line, x, f.y + size);
      if (i === 0) {
        doc.setFont(t.font, 'normal');
        doc.setFontSize(t.body);
        doc.setTextColor(...t.muted);
        doc.text(clean(dates), x + w, f.y + size, { align: 'right' });
      }
      f.y += lh;
    });
    if (sub) {
      para(doc, f, t, sub, x, w, { size: t.body, style: 'italic', color: t.muted, gap: 1 });
    }
  } else {
    para(doc, f, t, head, x, w, { size, style: 'bold', color: t.text });
    para(doc, f, t, [sub, dates].filter(Boolean).join('  |  '), x, w, { size: t.body - 0.4, style: 'italic', color: t.muted, gap: 1 });
  }
}

function experienceBlock(doc: jsPDF, f: Flow, t: Theme, d: ResumeData, x: number, w: number, timeline = false): void {
  if (!d.experience.length) {
    return;
  }
  t.heading(f, 'Work experience', x, w);
  for (const e of d.experience) {
    f.need(t.body * 1.38 * 3 + 6);
    const startPage = f.page;
    const startY = f.y;
    entry(doc, f, t, e.role || e.company, [e.role ? e.company : '', e.location].filter(Boolean).join(', '), e.dates, x, w);
    bullets(doc, f, t, e.bullets, x, w, t.body);
    if (timeline) {
      // a thin line down the side of the entry, with a dot at its start
      const lx = x - 13;
      if (f.page === startPage && f.y - startY > 16) {
        doc.setDrawColor(...tint(t.accent, 0.62));
        doc.setLineWidth(1.3);
        doc.line(lx, startY + 9, lx, f.y - 3);
      }
      doc.setFillColor(...t.accent);
      doc.circle(lx, startY + 8, 3.3, 'F');
      doc.setFillColor(255, 255, 255);
      doc.circle(lx, startY + 8, 1.2, 'F');
    }
    f.y += 6;
  }
}

function educationBlock(doc: jsPDF, f: Flow, t: Theme, d: ResumeData, x: number, w: number): void {
  if (!d.education.length) {
    return;
  }
  t.heading(f, 'Education', x, w);
  for (const e of d.education) {
    // keep one entry together on a page: reserve room for the title, the school and every details line
    doc.setFont(t.font, 'normal');
    doc.setFontSize(t.body);
    const detailLines = e.details ? (doc.splitTextToSize(clean(e.details), w) as string[]).length : 0;
    const titleLines = (doc.splitTextToSize(clean(e.degree || e.school), w) as string[]).length;
    f.need((titleLines + 1 + detailLines) * t.body * 1.4 + 10);
    entry(doc, f, t, e.degree || e.school, e.degree ? e.school : '', e.dates, x, w);
    para(doc, f, t, e.details, x, w, { size: t.body - 0.4, color: t.text });
    f.y += 5;
  }
}

function projectsBlock(doc: jsPDF, f: Flow, t: Theme, d: ResumeData, x: number, w: number): void {
  if (!d.projects.length) {
    return;
  }
  t.heading(f, 'Projects', x, w);
  for (const p of d.projects) {
    // keep one project together on a page: reserve room for all its lines
    doc.setFont(t.font, 'normal');
    doc.setFontSize(t.body);
    const lineCount = (doc.splitTextToSize(clean(p.description), w) as string[]).length + (p.tech ? 1 : 0) + 1;
    f.need(lineCount * t.body * 1.4 + 8);
    para(doc, f, t, p.name, x, w, { size: t.body + 0.4, style: 'bold', color: t.text });
    para(doc, f, t, p.description, x, w, { size: t.body, color: t.text });
    para(doc, f, t, p.tech ? 'Tech: ' + p.tech : '', x, w, { size: t.body - 0.6, style: 'italic', color: t.muted });
    f.y += 5;
  }
}

function summaryBlock(doc: jsPDF, f: Flow, t: Theme, d: ResumeData, x: number, w: number): void {
  if (!d.summary) {
    return;
  }
  t.heading(f, 'Profile', x, w);
  para(doc, f, t, d.summary, x, w, { size: t.body + 0.2, color: t.text, gap: 4 });
}

/** The profile photo, as a circle when `round` is true (with an optional ring around it). */
/** Limits what is drawn next to a circle (jsPDF's own clip() does not apply to a path it has already closed). */
function circleClip(doc: jsPDF, cx: number, cy: number, r: number): void {
  const k = doc.internal.scaleFactor;
  const h = doc.internal.pageSize.getHeight();
  const c = 0.5523 * r;
  const X = (v: number) => (v * k).toFixed(3);
  const Y = (v: number) => ((h - v) * k).toFixed(3);
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    `${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(x3)} ${Y(y3)} c`;
  (doc.internal as unknown as { write: (...ops: string[]) => void }).write(
    `${X(cx + r)} ${Y(cy)} m`,
    curve(cx + r, cy + c, cx + c, cy + r, cx, cy + r),
    curve(cx - c, cy + r, cx - r, cy + c, cx - r, cy),
    curve(cx - r, cy - c, cx - c, cy - r, cx, cy - r),
    curve(cx + c, cy - r, cx + r, cy - c, cx + r, cy),
    'h W n',
  );
}

function drawPhoto(doc: jsPDF, photo: string, x: number, y: number, size: number, round: boolean, ring: RGB | null): void {
  try {
    const format = photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    if (round) {
      if (ring) {
        doc.setFillColor(...ring);
        doc.circle(x + size / 2, y + size / 2, size / 2 + 3, 'F');
      }
      doc.saveGraphicsState();
      circleClip(doc, x + size / 2, y + size / 2, size / 2);
      doc.addImage(photo, format, x, y, size, size);
      doc.restoreGraphicsState();
    } else {
      doc.addImage(photo, format, x, y, size, size);
      doc.setDrawColor(...(ring ?? [200, 205, 212]));
      doc.setLineWidth(0.8);
      doc.rect(x, y, size, size, 'S');
    }
  } catch {
    /* a photo that cannot be drawn is simply left out */
  }
}

/** Skills as small rounded tags that wrap onto new lines. */
function pills(doc: jsPDF, f: Flow, t: Theme, items: string[], x: number, w: number, style?: { fill: RGB; border: RGB; text: RGB }): void {
  const size = 8.3;
  const h = 14.5;
  const padX = 6;
  let cx = x;
  for (const item of items) {
    let label = clean(item);
    if (!label) {
      continue;
    }
    doc.setFont(t.font, 'normal');
    doc.setFontSize(size);
    if (doc.getTextWidth(label) + padX * 2 > w) {
      label = (doc.splitTextToSize(label, w - padX * 2) as string[])[0];
    }
    const tw = doc.getTextWidth(label) + padX * 2;
    if (cx + tw > x + w && cx > x) {
      cx = x;
      f.y += h + 4;
    }
    f.need(h + 4);
    doc.setFillColor(...(style?.fill ?? [255, 255, 255]));
    doc.setDrawColor(...(style?.border ?? tint(t.accent, 0.5)));
    doc.setLineWidth(0.7);
    doc.roundedRect(cx, f.y, tw, h, 3.2, 3.2, 'FD');
    doc.setFont(t.font, 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(style?.text ?? t.text));
    doc.text(label, cx + padX, f.y + h * 0.7);
    cx += tw + 4;
  }
  f.y += h + 7;
}

// ---------- templates ----------
type SideVariant = 'modern' | 'bold' | 'creative';

/** A column of skills, one per line with a small square, for dark and colour columns. */
function skillList(doc: jsPDF, f: Flow, t: Theme, items: string[], x: number, w: number, color: RGB, mark: RGB): void {
  for (const item of items) {
    const label = clean(item);
    if (!label) {
      continue;
    }
    doc.setFont(t.font, 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(label, w - 12) as string[];
    lines.forEach((line, i) => {
      f.need(13);
      if (i === 0) {
        doc.setFillColor(...mark);
        doc.rect(x, f.y + 3.6, 4, 4, 'F');
      }
      doc.setFont(t.font, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...color);
      doc.text(line, x + 11, f.y + 9);
      f.y += 13;
    });
    f.y += 1.5;
  }
  f.y += 4;
}

/**
 * The designs with a side column: Modern (colour header, light column), Bold (dark column that holds the photo and the name)
 * and Creative (a big colour column, the name in large type on the white side, filled rounded labels).
 */
function sidebar(doc: jsPDF, d: ResumeData, accent: RGB, variant: SideVariant): void {
  const modernV = variant === 'modern';
  const bold = variant === 'bold';
  const creative = variant === 'creative';
  const side = modernV ? 192 : bold ? 208 : 222;
  const headerH = modernV ? (d.photo ? 128 : 108) : 0;
  const text: RGB = [31, 41, 55];
  const muted: RGB = [95, 105, 120];
  const sideBg: RGB = modernV ? tint(accent, 0.92) : bold ? [23, 28, 40] : accent;
  const sideText: RGB = modernV ? text : [255, 255, 255];
  const sideSoft: RGB = modernV ? text : bold ? [200, 208, 222] : tint(accent, 0.82);
  const sideHead: RGB = modernV ? accent : bold ? tint(accent, 0.45) : [255, 255, 255];

  const decorate = (page: number) => {
    const top = page === 1 ? headerH : 0;
    doc.setFillColor(...sideBg);
    doc.rect(0, top, side, A4.h - top, 'F');
    if (creative) {
      doc.setFillColor(...shade(accent, 0.18));
      doc.rect(side - 5, top, 5, A4.h - top, 'F');
    }
  };

  // main-column heading: Modern and Bold use an accent bar, Creative a filled rounded label
  const heading = (f: Flow, label: string, x: number, _w: number) => {
    f.y += creative ? 10 : 7;
    f.need(72); // a heading always keeps its first lines with it
    if (creative) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      const title = clean(label).toUpperCase();
      const tw = doc.getTextWidth(title) + title.length * 0.9 + 22;
      doc.setFillColor(...accent);
      doc.roundedRect(x, f.y, tw, 18, 9, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(title, x + 11, f.y + 12.5, { charSpace: 0.9 });
      f.y += 28;
      return;
    }
    doc.setFillColor(...accent);
    doc.rect(x, f.y + 0.5, 3.2, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...accent);
    doc.text(clean(label).toUpperCase(), x + 10, f.y + 10, { charSpace: 0.9 });
    f.y += 21;
  };
  // side-column heading: the title with a short underline
  const sideHeading = (f: Flow, label: string, x: number) => {
    f.y += 6;
    f.need(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...sideHead);
    doc.text(clean(label).toUpperCase(), x, f.y + 9.5, { charSpace: 0.8 });
    f.y += 14;
    doc.setDrawColor(...(creative ? tint(accent, 0.55) : sideHead));
    doc.setLineWidth(1.4);
    doc.line(x, f.y, x + 24, f.y);
    f.y += 9;
  };
  const theme: Theme = { font: 'helvetica', accent, text, muted, body: 9.6, datesRight: false, heading };

  pageStart();
  decorate(1);
  const sx = 22;
  const sw = side - 40;
  let sideTop = 20;
  let mainTop = 36;
  const mx = side + 36;
  const mw = A4.w - mx - 34;

  if (modernV) {
    // colour header with the name, the title and the photo
    doc.setFillColor(...accent);
    doc.rect(0, 0, A4.w, headerH, 'F');
    doc.setFillColor(...shade(accent, 0.22));
    doc.rect(0, headerH - 5, A4.w, 5, 'F');
    const photoSize = 84;
    const textW = A4.w - 72 - (d.photo ? photoSize + 24 : 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(27);
    doc.setTextColor(255, 255, 255);
    const nameLines = (doc.splitTextToSize(clean(d.name), textW) as string[]).slice(0, 2);
    doc.text(nameLines, 36, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(...tint(accent, 0.86));
    const titleLines = (doc.splitTextToSize(clean(d.title), textW) as string[]).slice(0, 2);
    doc.text(titleLines, 36, 48 + nameLines.length * 28 + 2);
    if (d.photo) {
      drawPhoto(doc, d.photo, A4.w - 36 - photoSize, (headerH - 5 - photoSize) / 2, photoSize, true, [255, 255, 255]);
    }
    sideTop = headerH + 20;
    mainTop = headerH + 20;
  } else if (bold) {
    // the photo, then the name and the title, all inside the dark column
    let y = 34;
    if (d.photo) {
      const size = 104;
      drawPhoto(doc, d.photo, (side - size) / 2, y, size, true, accent);
      y += size + 24;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(255, 255, 255);
    const nameLines = (doc.splitTextToSize(clean(d.name), sw) as string[]).slice(0, 3);
    doc.text(nameLines, sx, y + 16, { lineHeightFactor: 1.15 });
    y += nameLines.length * 24 + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...tint(accent, 0.5));
    const titleLines = (doc.splitTextToSize(clean(d.title).toUpperCase(), sw) as string[]).slice(0, 3);
    doc.text(titleLines, sx, y + 12, { charSpace: 0.6 });
    y += titleLines.length * 14 + 8;
    sideTop = y + 6;
    mainTop = 40;
  } else {
    // Creative: the photo at the top of the colour column, the name in large type on the white side
    let y = 34;
    if (d.photo) {
      const size = 118;
      drawPhoto(doc, d.photo, (side - size) / 2, y, size, true, [255, 255, 255]);
      y += size + 26;
    }
    sideTop = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(35);
    doc.setTextColor(...accent);
    const nameLines = (doc.splitTextToSize(clean(d.name), mw) as string[]).slice(0, 3);
    doc.text(nameLines, mx, 66, { lineHeightFactor: 1.08 });
    let my = 66 + (nameLines.length - 1) * 38 + 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...muted);
    const titleLines = (doc.splitTextToSize(clean(d.title).toUpperCase(), mw) as string[]).slice(0, 2);
    doc.text(titleLines, mx, my, { charSpace: 1.6 });
    my += titleLines.length * 15;
    doc.setFillColor(...accent);
    doc.rect(mx, my, 46, 4, 'F');
    mainTop = my + 22;
    if (!d.photo) {
      sideTop = 46;
    }
  }

  // side column: contact, skills, languages, certifications
  const left = new Flow(doc, 20, A4.h - 36, decorate, Math.max(sideTop, 20));
  const contact = contactLine(d);
  if (contact.length) {
    sideHeading(left, 'Contact', sx);
    for (const c of contact) {
      para(doc, left, theme, c, sx, sw, { size: 8.8, color: sideText, gap: 3 });
    }
  }
  if (d.skills.length) {
    sideHeading(left, 'Skills', sx);
    for (const g of d.skills) {
      para(doc, left, theme, g.group, sx, sw, { size: 9, style: 'bold', color: sideText, gap: 3 });
      if (modernV) {
        pills(doc, left, theme, g.items, sx, sw);
      } else if (bold) {
        pills(doc, left, theme, g.items, sx, sw, { fill: [38, 46, 64], border: tint(accent, 0.15), text: [236, 240, 247] });
      } else {
        skillList(doc, left, theme, g.items, sx, sw, sideText, tint(accent, 0.7));
      }
    }
  }
  if (d.languages.length) {
    sideHeading(left, 'Languages', sx);
    para(doc, left, theme, d.languages.join(', '), sx, sw, { size: 8.8, color: sideSoft, gap: 4 });
  }
  if (d.certifications.length) {
    sideHeading(left, 'Certifications', sx);
    for (const c of d.certifications) {
      para(doc, left, theme, c, sx, sw, { size: 8.8, color: sideSoft, gap: 3 });
    }
  }

  // main column, in the order that suits this person
  const main = new Flow(doc, 36, A4.h - 40, decorate, mainTop, 1);
  for (const key of sectionOrder(d)) {
    if (key === 'summary') {
      summaryBlock(doc, main, theme, d, mx, mw);
    } else if (key === 'experience') {
      experienceBlock(doc, main, theme, d, mx, mw, !creative);
    } else if (key === 'education') {
      educationBlock(doc, main, theme, d, mx, mw);
    } else if (key === 'projects') {
      projectsBlock(doc, main, theme, d, mx, mw);
    }
  }
}

type ColumnVariant = 'classic' | 'minimal' | 'executive' | 'elegant';

/** The one-column designs: Classic, Minimal, Executive (heavy rule under the name) and Elegant (centred, fine lines). */
function singleColumn(doc: jsPDF, d: ResumeData, accent: RGB, kind: ColumnVariant): void {
  const classic = kind === 'classic';
  const executive = kind === 'executive';
  const elegant = kind === 'elegant';
  const serif = classic || elegant;
  const font: 'times' | 'helvetica' = serif ? 'times' : 'helvetica';
  const text: RGB = classic ? [0, 0, 0] : elegant ? [38, 38, 42] : executive ? [24, 30, 40] : [30, 35, 45];
  const muted: RGB = classic ? [70, 70, 70] : elegant ? [100, 96, 92] : [110, 118, 130];
  const m = classic ? 54 : executive ? 52 : elegant ? 60 : 60;
  const w = A4.w - m * 2;

  const heading = (f: Flow, label: string, x: number, width: number) => {
    f.y += classic ? 8 : executive ? 10 : 12;
    f.need(72); // a heading always keeps its first lines with it
    doc.setFont(font, 'bold');
    const title = clean(label).toUpperCase();
    if (classic) {
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(title, x, f.y + 11, { charSpace: 0.6 });
      f.y += 15;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.7);
      doc.line(x, f.y, x + width, f.y);
      f.y += 7;
    } else if (executive) {
      doc.setFontSize(10.5);
      doc.setTextColor(...accent);
      doc.text(title, x, f.y + 10.5, { charSpace: 1.3 });
      f.y += 15;
      doc.setDrawColor(...tint(accent, 0.55));
      doc.setLineWidth(0.9);
      doc.line(x, f.y, x + width, f.y);
      f.y += 8;
    } else if (elegant) {
      doc.setFontSize(10.2);
      doc.setTextColor(...accent);
      const tw = doc.getTextWidth(title) + (title.length - 1) * 2.2;
      const cx = x + width / 2;
      doc.text(title, cx - tw / 2, f.y + 10, { charSpace: 2.2 });
      doc.setDrawColor(...tint(accent, 0.45));
      doc.setLineWidth(0.6);
      doc.line(x, f.y + 6.5, cx - tw / 2 - 14, f.y + 6.5);
      doc.line(cx + tw / 2 + 14, f.y + 6.5, x + width, f.y + 6.5);
      f.y += 20;
    } else {
      doc.setFontSize(8.8);
      doc.setTextColor(...accent);
      doc.text(title, x, f.y + 9, { charSpace: 1.6 });
      f.y += 17;
    }
  };
  const theme: Theme = { font, accent, text, muted, body: serif ? 10.4 : executive ? 10 : 9.8, datesRight: true, heading };
  pageStart();
  const f = new Flow(doc, m - 6, A4.h - m, () => undefined, m);

  // header, with the photo on the right when there is one (centred above the name for Elegant)
  const photoSize = 72;
  const headW = d.photo && !elegant ? w - photoSize - 18 : w;
  const headTop = f.y;
  if (classic) {
    para(doc, f, theme, d.name, m, headW, { size: 25, style: 'bold', color: text, align: 'center' });
    para(doc, f, theme, d.title, m, headW, { size: 12, style: 'italic', color: muted, align: 'center', gap: 1 });
    para(doc, f, theme, contactLine(d).join('   |   '), m, headW, { size: 9.4, color: muted, align: 'center', gap: 4 });
  } else if (executive) {
    para(doc, f, theme, d.name, m, headW, { size: 28, style: 'bold', color: text });
    para(doc, f, theme, clean(d.title).toUpperCase(), m, headW, { size: 11, style: 'bold', color: accent, gap: 5 });
    if (!d.photo) {
      doc.setFillColor(...accent);
      doc.rect(m, f.y, w, 2.6, 'F');
      f.y += 10;
    }
    para(doc, f, theme, dash(contactLine(d)), m, headW, { size: 9.2, color: muted, gap: 4 });
    if (d.photo) {
      // the heavy rule runs under the whole header, photo included
      f.y = Math.max(f.y, headTop + photoSize + 8);
      doc.setFillColor(...accent);
      doc.rect(m, f.y, w, 2.6, 'F');
      f.y += 12;
    }
  } else if (elegant) {
    if (d.photo) {
      drawPhoto(doc, d.photo, A4.w / 2 - photoSize / 2, f.y, photoSize, true, tint(accent, 0.4));
      f.y += photoSize + 14;
    }
    para(doc, f, theme, d.name, m, w, { size: 27, style: 'bold', color: text, align: 'center' });
    para(doc, f, theme, d.title, m, w, { size: 12.2, style: 'italic', color: muted, align: 'center', gap: 5 });
    // a fine line with a small diamond in the middle
    const cx = A4.w / 2;
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.7);
    doc.line(m + 30, f.y + 4, cx - 9, f.y + 4);
    doc.line(cx + 9, f.y + 4, A4.w - m - 30, f.y + 4);
    doc.setFillColor(...accent);
    doc.lines([[4, 4], [-4, 4], [-4, -4], [4, -4]], cx, f.y, [1, 1], 'F', true);
    f.y += 14;
    para(doc, f, theme, contactLine(d).join('   |   '), m, w, { size: 9.2, color: muted, align: 'center', gap: 4 });
  } else {
    para(doc, f, theme, d.name, m, headW, { size: 29, style: 'bold', color: text });
    para(doc, f, theme, d.title, m, headW, { size: 12.5, color: accent, gap: 2 });
    para(doc, f, theme, dash(contactLine(d)), m, headW, { size: 9, color: muted, gap: 6 });
  }
  if (d.photo && !elegant) {
    drawPhoto(doc, d.photo, A4.w - m - photoSize, headTop, photoSize, !classic && !executive, classic ? [120, 120, 120] : executive ? accent : null);
    f.y = Math.max(f.y, headTop + photoSize + 6);
  }

  const skillsBlock = () => {
    if (!d.skills.length) {
      return;
    }
    heading(f, 'Skills', m, w);
    for (const g of d.skills) {
      const label = clean(g.group) + ': ';
      doc.setFont(font, 'bold');
      doc.setFontSize(theme.body);
      const lw = doc.getTextWidth(label);
      const items = clean(g.items.join(', '));
      const lines = doc.splitTextToSize(items, w - lw) as string[];
      lines.forEach((line, i) => {
        f.need(theme.body * 1.4);
        if (i === 0) {
          doc.setFont(font, 'bold');
          doc.setFontSize(theme.body);
          doc.setTextColor(...text);
          doc.text(label, m, f.y + theme.body);
        }
        doc.setFont(font, 'normal');
        doc.setFontSize(theme.body);
        doc.setTextColor(...text);
        doc.text(line, m + lw, f.y + theme.body);
        f.y += theme.body * 1.4;
      });
      f.y += 2;
    }
  };
  const sections: Record<SectionKey, () => void> = {
    summary: () => summaryBlock(doc, f, theme, d, m, w),
    skills: skillsBlock,
    experience: () => experienceBlock(doc, f, theme, d, m, w),
    education: () => educationBlock(doc, f, theme, d, m, w),
    projects: () => projectsBlock(doc, f, theme, d, m, w),
    certifications: () => {
      if (d.certifications.length) {
        heading(f, 'Certifications', m, w);
        bullets(doc, f, theme, d.certifications, m, w, theme.body);
      }
    },
    languages: () => {
      if (d.languages.length) {
        heading(f, 'Languages', m, w);
        para(doc, f, theme, d.languages.join(', '), m, w, { size: theme.body, color: text });
      }
    },
  };
  for (const key of sectionOrder(d)) {
    sections[key]();
  }
}

// ---------- public: PDF ----------
/** Draws the resume once at the given scale (1 = normal) and returns the file and how many pages it has. */
async function draw(data: ResumeData, template: ResumeTemplate, accent: RGB, scale: number): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const raw = doc.internal as unknown as { write: (...parts: string[]) => void };
  A4 = { w: PAGE.w / scale, h: PAGE.h / scale };
  pageStart = scale < 1 ? () => raw.write(`q ${scale} 0 0 ${scale} 0 ${(PAGE.h * (1 - scale)).toFixed(3)} cm`) : () => undefined;
  try {
    if (template === 'modern' || template === 'bold' || template === 'creative') {
      sidebar(doc, data, accent, template);
    } else {
      singleColumn(doc, data, accent, template);
    }
    const pages = doc.getNumberOfPages();
    if (scale < 1) {
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        raw.write('Q');
      }
    }
    doc.setProperties({ title: `${clean(data.name)} - Resume`, creator: 'SeeCareer' });
    return { blob: doc.output('blob'), pages };
  } finally {
    A4 = { w: PAGE.w, h: PAGE.h };
    pageStart = () => undefined;
  }
}

/**
 * Builds the PDF. A resume that is only a little too long for one page is shrunk to fit it,
 * the way a designer would. A longer one simply runs onto a second page.
 */
export async function buildResumePdf(data: ResumeData, template: ResumeTemplate, accentHex: string): Promise<Blob> {
  const accent = hexToRgb(ensureContrast(accentHex));
  const natural = await draw(data, template, accent, 1);
  if (natural.pages === 1) {
    return natural.blob;
  }
  if (natural.pages === 2) {
    for (const scale of [0.94, 0.89, 0.84]) {
      const fitted = await draw(data, template, accent, scale);
      if (fitted.pages === 1) {
        return fitted.blob;
      }
    }
  }
  return natural.blob;
}

// ---------- public: Word ----------
export async function buildResumeDocx(data: ResumeData, template: ResumeTemplate, accentHex: string): Promise<Blob> {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, TabStopType, AlignmentType, ImageRun } = d;
  const accentSafe = ensureContrast(accentHex);
  const accent = accentSafe.replace('#', '').toUpperCase();
  const light = tint(hexToRgb(accentSafe), 0.92)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  // Word has two layouts (side column and one column); the other designs use the nearest one with their own colours and fonts
  const sideLayout = template === 'modern' || template === 'bold' || template === 'creative';
  const classic = template === 'classic' || template === 'executive' || template === 'elegant';
  const font = classic ? 'Times New Roman' : 'Calibri';
  const T = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string; caps?: boolean } = {}) =>
    new TextRun({ text, font, bold: o.bold, italics: o.italics, size: o.size ?? 21, color: o.color, allCaps: o.caps });
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const cellBorders = { top: none, bottom: none, left: none, right: none };

  const heading = (label: string, color = accent) =>
    new Paragraph({
      spacing: { before: 200, after: 80 },
      border: classic ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: template === 'classic' ? '000000' : accent, space: 1 } } : sideLayout ? { bottom: { style: BorderStyle.SINGLE, size: 8, color: accent, space: 1 } } : undefined,
      children: [T(label, { bold: true, size: template === 'minimal' ? 18 : 22, color: template === 'classic' ? '000000' : color, caps: true })],
    });

  const bulletsOf = (items: string[]) => items.filter(Boolean).map((b) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [T(b, { size: 20 })] }));

  const entryOf = (head: string, sub: string, dates: string, width: number) => [
    new Paragraph({
      spacing: { before: 90 },
      tabStops: [{ type: TabStopType.RIGHT, position: width }],
      children: [T(head, { bold: true, size: 22 }), ...(dates ? [T('\t' + dates, { size: 19, color: '666666' })] : [])],
    }),
    ...(sub ? [new Paragraph({ children: [T(sub, { italics: true, size: 20, color: '555555' })] })] : []),
  ];

  const experience = (width: number) =>
    !data.experience.length
      ? []
      : [
          heading('Work experience'),
          ...data.experience.flatMap((e) => [
            ...entryOf(e.role || e.company, [e.role ? e.company : '', e.location].filter(Boolean).join(', '), e.dates, width),
            ...bulletsOf(e.bullets),
          ]),
        ];
  const education = (width: number) =>
    !data.education.length
      ? []
      : [
          heading('Education'),
          ...data.education.flatMap((e) => [
            ...entryOf(e.degree || e.school, e.degree ? e.school : '', e.dates, width),
            ...(e.details ? [new Paragraph({ children: [T(e.details, { size: 20 })] })] : []),
          ]),
        ];
  const projects = () =>
    !data.projects.length
      ? []
      : [
          heading('Projects'),
          ...data.projects.flatMap((p) => [
            new Paragraph({ spacing: { before: 80 }, children: [T(p.name, { bold: true, size: 21 })] }),
            new Paragraph({ children: [T(p.description, { size: 20 })] }),
            ...(p.tech ? [new Paragraph({ children: [T('Tech: ' + p.tech, { italics: true, size: 19, color: '666666' })] })] : []),
          ]),
        ];
  const summary = () => (data.summary ? [heading('Profile'), new Paragraph({ spacing: { after: 60 }, children: [T(data.summary, { size: 21 })] })] : []);
  const skillsFlat = () =>
    !data.skills.length
      ? []
      : [heading('Skills'), ...data.skills.map((g) => new Paragraph({ spacing: { after: 30 }, children: [T(g.group + ': ', { bold: true, size: 20 }), T(g.items.join(', '), { size: 20 })] }))];
  const certsFlat = () => (!data.certifications.length ? [] : [heading('Certifications'), ...bulletsOf(data.certifications)]);
  const langsFlat = () => (!data.languages.length ? [] : [heading('Languages'), new Paragraph({ children: [T(data.languages.join(', '), { size: 20 })] })]);
  const contact = contactLine(data);

  // the profile photo as a picture inside a paragraph
  const photoParagraph = () => {
    if (!data.photo) {
      return null;
    }
    const png = data.photo.startsWith('data:image/png');
    const bytes = Uint8Array.from(atob(data.photo.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    return new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new ImageRun({ type: png ? 'png' : 'jpg', data: bytes, transformation: { width: 88, height: 88 }, altText: { name: 'Photo', description: 'Profile photo', title: 'Photo' } })],
    });
  };

  const order = sectionOrder(data);
  let children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[];
  let margins = { top: 720, bottom: 720, left: 900, right: 900 };

  if (sideLayout) {
    margins = { top: 480, bottom: 600, left: 500, right: 500 };
    const photo = photoParagraph();
    const nameCell = (width: number) =>
      new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
        margins: { top: 260, bottom: 260, left: 300, right: 300 },
        borders: cellBorders,
        children: [
          new Paragraph({ children: [T(data.name, { bold: true, size: 56, color: 'FFFFFF' })] }),
          new Paragraph({ children: [T(data.title, { size: 26, color: 'FFFFFF' })] }),
        ],
      });
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: photo
            ? [
                nameCell(80),
                new TableCell({
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
                  margins: { top: 200, bottom: 200, left: 100, right: 300 },
                  borders: cellBorders,
                  children: [photo],
                }),
              ]
            : [nameCell(100)],
        }),
      ],
    });
    const side = [
      ...(contact.length ? [heading('Contact'), ...contact.map((c) => new Paragraph({ spacing: { after: 40 }, children: [T(c, { size: 19 })] }))] : []),
      ...skillsFlat(),
      ...langsFlat(),
      ...certsFlat(),
    ];
    const mainKeys: SectionKey[] = ['summary', 'experience', 'education', 'projects'];
    const mainBuilders: Partial<Record<SectionKey, () => (InstanceType<typeof Paragraph>)[]>> = {
      summary,
      experience: () => experience(7000),
      education: () => education(7000),
      projects,
    };
    const bodyTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      columnWidths: [3000, 7700],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: light, color: 'auto' },
              margins: { top: 120, bottom: 200, left: 220, right: 160 },
              borders: cellBorders,
              children: side.length ? (side as InstanceType<typeof Paragraph>[]) : [new Paragraph('')],
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              margins: { top: 120, bottom: 200, left: 260, right: 120 },
              borders: cellBorders,
              children: order.filter((k) => mainKeys.includes(k)).flatMap((k) => mainBuilders[k]!()),
            }),
          ],
        }),
      ],
    });
    children = [headerTable, new Paragraph({ spacing: { after: 60 } }), bodyTable];
  } else {
    const width = 9600;
    const headParagraphs =
      template === 'classic'
        ? [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [T(data.name, { bold: true, size: 52 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [T(data.title, { italics: true, size: 24, color: '444444' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [T(contact.join('   |   '), { size: 19, color: '555555' })] }),
          ]
        : [
            new Paragraph({ children: [T(data.name, { bold: true, size: 58 })] }),
            new Paragraph({ children: [T(data.title, { size: 25, color: accent })] }),
            new Paragraph({ spacing: { after: 120 }, children: [T(contact.join('   |   '), { size: 18, color: '666666' })] }),
          ];
    const photo = photoParagraph();
    const head: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = photo
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: 82, type: WidthType.PERCENTAGE }, borders: cellBorders, children: headParagraphs }),
                  new TableCell({ width: { size: 18, type: WidthType.PERCENTAGE }, borders: cellBorders, children: [photo] }),
                ],
              }),
            ],
          }),
        ]
      : headParagraphs;
    const builders: Record<SectionKey, () => InstanceType<typeof Paragraph>[]> = {
      summary,
      skills: skillsFlat,
      experience: () => experience(width),
      education: () => education(width),
      projects,
      certifications: certsFlat,
      languages: langsFlat,
    };
    children = [...head, ...order.flatMap((k) => builders[k]())];
  }

  const doc = new Document({
    creator: 'SeeCareer',
    title: `${data.name} - Resume`,
    sections: [{ properties: { page: { margin: margins } }, children }],
  });
  return Packer.toBlob(doc);
}

export async function buildResumeFile(
  format: 'pdf' | 'docx',
  data: ResumeData,
  template: ResumeTemplate,
  accentHex: string,
): Promise<Blob> {
  return format === 'pdf' ? buildResumePdf(data, template, accentHex) : buildResumeDocx(data, template, accentHex);
}
