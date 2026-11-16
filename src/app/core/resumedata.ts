export interface ResumeExperience {
  role: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface ResumeEducation {
  degree: string;
  school: string;
  dates: string;
  details: string;
}

export interface ResumeProject {
  name: string;
  description: string;
  tech: string;
}

export interface ResumeSkillGroup {
  group: string;
  items: string[];
}

export interface ResumeData {
  name: string;
  title: string;
  contact: { email: string; phone: string; location: string; links: string[] };
  summary: string;
  skills: ResumeSkillGroup[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  certifications: string[];
  languages: string[];
  design?: { template?: ResumeTemplate; accent?: string; order?: SectionKey[]; paper?: string };
  photo?: string;
}

export type SectionKey = 'summary' | 'skills' | 'experience' | 'education' | 'projects' | 'certifications' | 'languages';
export const sectionKeys: SectionKey[] = ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages'];

export interface PaperSize {
  key: string;
  label: string;
  short: string;
  w: number;
  h: number;
}

const mm = (v: number) => Math.round((v * 72) / 25.4 * 100) / 100;

export const PAPERS: PaperSize[] = [
  { key: 'a4', label: 'A4 (210 × 297 mm)', short: 'A4', w: 595.28, h: 841.89 },
  { key: 'letter', label: 'Letter / short bond (8.5 × 11 in)', short: 'Letter', w: 612, h: 792 },
  { key: 'legal', label: 'Legal (8.5 × 14 in)', short: 'Legal', w: 612, h: 1008 },
  { key: 'folio', label: 'Long bond / Folio (8.5 × 13 in)', short: 'Long bond', w: 612, h: 936 },
  { key: 'a5', label: 'A5 (148 × 210 mm)', short: 'A5', w: mm(148), h: mm(210) },
  { key: 'a3', label: 'A3 (297 × 420 mm)', short: 'A3', w: mm(297), h: mm(420) },
  { key: 'b5', label: 'B5 (176 × 250 mm)', short: 'B5', w: mm(176), h: mm(250) },
  { key: 'b4', label: 'B4 (250 × 353 mm)', short: 'B4', w: mm(250), h: mm(353) },
  { key: 'executive', label: 'Executive (7.25 × 10.5 in)', short: 'Executive', w: 522, h: 756 },
  { key: 'tabloid', label: 'Tabloid (11 × 17 in)', short: 'Tabloid', w: 792, h: 1224 },
];

const minSide = 216;
const maxSide = 1728;

export function customPaper(wPt: number, hPt: number): string | undefined {
  if (!(wPt > 0 && hPt > 0)) {
    return undefined;
  }
  const w = Math.round(Math.min(maxSide, Math.max(minSide, wPt)));
  const h = Math.round(Math.min(maxSide, Math.max(minSide, hPt)));
  const known = PAPERS.find((p) => Math.abs(p.w - w) <= 2 && Math.abs(p.h - h) <= 2);
  return known ? known.key : `custom-${w}x${h}`;
}

export function paperOf(key?: string): PaperSize {
  const known = PAPERS.find((p) => p.key === key);
  if (known) {
    return known;
  }
  const m = /^custom-(\d+)x(\d+)$/.exec(key ?? '');
  if (m) {
    const w = Math.min(maxSide, Math.max(minSide, +m[1]));
    const h = Math.min(maxSide, Math.max(minSide, +m[2]));
    const inch = (v: number) => Math.round((v / 72) * 100) / 100;
    const size = `${inch(w)} × ${inch(h)} in`;
    return { key: `custom-${w}x${h}`, label: `Custom (${size})`, short: size, w, h };
  }
  return PAPERS[0];
}

export function paperScale(key?: string): number {
  return Math.min(1.6, Math.max(0.8, paperOf(key).w / 595.28));
}

const paperWords = /\b(paper|size|sized|page|sheet|bond|format|print(ed|ing)?|layout)\b/i;

export function detectPaper(text: string): string | undefined {
  const t = (text ?? '').toLowerCase();
  const endsWithSize = /\b(resume|cv)\b/.test(t) && /\b(legal|letter|a[3-5]|b[45]|folio|long bond|short bond|tabloid)\s*[.!]?\s*$/.test(t);
  const context = paperWords.test(t) || t.trim().length <= 24 || endsWithSize;
  const dims = /(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|mm|cm)?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|mm|cm)?/i.exec(t);
  if (dims && (context || dims[2] || dims[4])) {
    const unit = (dims[2] || dims[4] || '').toLowerCase();
    const a = parseFloat(dims[1]);
    const b = parseFloat(dims[3]);
    const factor = unit.startsWith('mm') ? 72 / 25.4 : unit === 'cm' ? 720 / 25.4 : unit ? 72 : Math.max(a, b) > 40 ? 72 / 25.4 : 72;
    const found = customPaper(Math.min(a, b) * factor, Math.max(a, b) * factor);
    if (found) {
      return found;
    }
  }
  if (/\blong\s*bond\b|\bfolio\b|\bf4\b/.test(t)) return 'folio';
  if (/\bshort\s*bond\b/.test(t)) return 'letter';
  if (/\btabloid\b|\bledger\b/.test(t)) return 'tabloid';
  const iso = /\b([ab][3-5])\b/.exec(t);
  if (iso && (context || /\b(to|in|on|into|use|make it)\s+[ab][3-5]\b/.test(t))) return iso[1];
  if (!context) return undefined;
  if (/\blegal\b/.test(t) && !/\blegal (assistant|secretary|officer|counsel|advisor|adviser|analyst|clerk|aide|researcher|writer|department|team)\b/.test(t)) return 'legal';
  const strict = paperWords.test(t) || endsWithSize || /^\s*(make it|use|to|switch to|change (it )?to|in|on)?\s*(us\s*)?letter\s*[.!]?\s*$/.test(t);
  if (strict && /\bletter\b/.test(t) && !/\bcover letter\b|\bletter of\b/.test(t)) return 'letter';
  if (/\bexecutive (paper|size|sized|page|sheet)\b/.test(t)) return 'executive';
  return undefined;
}

export type ResumeTemplate = 'modern' | 'bold' | 'creative' | 'classic' | 'minimal' | 'executive' | 'elegant';

export const TEMPLATES: { key: ResumeTemplate; label: string; blurb: string; fits: string }[] = [
  { key: 'modern', label: 'Modern', blurb: 'Colour header, light side column, skill tags', fits: 'tech, startups, marketing, most fresh graduates' },
  { key: 'bold', label: 'Bold', blurb: 'Dark side column with photo and name, strong contrast', fits: 'developers, engineers, designers who want to stand out, trades' },
  { key: 'creative', label: 'Creative', blurb: 'Big colour column, large name, rounded labels', fits: 'designers, artists, media, content, hospitality, beauty, events' },
  { key: 'classic', label: 'Classic', blurb: 'Traditional serif, one column, centred header', fits: 'government, teaching, law, finance, academic, conservative employers' },
  { key: 'minimal', label: 'Minimal', blurb: 'Clean and airy, small caps headings', fits: 'short resumes, UX and product people, writers, consultants' },
  { key: 'executive', label: 'Executive', blurb: 'Confident serif with a heavy rule under the name', fits: 'managers, directors, senior professionals, healthcare leaders' },
  { key: 'elegant', label: 'Elegant', blurb: 'Centred serif with fine lines and ornaments', fits: 'luxury, fashion, hospitality, education, nursing, customer service' },
];

export const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#0369a1' },
  { name: 'Navy', hex: '#1e3a8a' },
  { name: 'Indigo', hex: '#4338ca' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Green', hex: '#15803d' },
  { name: 'Forest', hex: '#14532d' },
  { name: 'Purple', hex: '#6d28d9' },
  { name: 'Rose', hex: '#be185d' },
  { name: 'Burgundy', hex: '#7f1d1d' },
  { name: 'Red', hex: '#b91c1c' },
  { name: 'Orange', hex: '#c2410c' },
  { name: 'Gold', hex: '#92400e' },
  { name: 'Slate', hex: '#334155' },
  { name: 'Charcoal', hex: '#1f2937' },
];

export const resumeJsonShape = `{
  "name": "Full Name",
  "title": "Target job title, e.g. Junior Web Developer",
  "contact": { "email": "", "phone": "", "location": "City, Country", "links": ["linkedin.com/in/...", "github.com/..."] },
  "summary": "2 to 3 sentences, no first person",
  "skills": [ { "group": "Technical", "items": ["Angular", "TypeScript"] }, { "group": "Soft skills", "items": ["Teamwork"] } ],
  "experience": [ { "role": "", "company": "", "location": "", "dates": "Jan 2024 - Present", "bullets": ["Started with an action verb, one result per bullet"] } ],
  "education": [ { "degree": "", "school": "", "dates": "2022 - 2026", "details": "" } ],
  "projects": [ { "name": "", "description": "", "tech": "" } ],
  "certifications": [ "" ],
  "languages": [ "English", "Filipino" ],
  "design": { "template": "modern | bold | creative | classic | minimal | executive | elegant (choose one)", "accent": "a colour name such as Teal, or a hex like #0e7490", "order": ["summary", "experience", "education", "skills", "projects", "certifications", "languages"], "paper": "a4 | letter | legal | folio | a5 | a3 | b5 | b4 | executive | tabloid, or custom-WIDTHxHEIGHT in points. Only set it when the user asks for a paper size, otherwise leave it out" }
}`;

export function accentFromName(name: unknown): string | undefined {
  const v = String(name ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    return v.toLowerCase();
  }
  return ACCENTS.find((a) => a.name.toLowerCase() === v.toLowerCase())?.hex;
}

const str = (v: unknown, max = 600): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const list = (v: unknown, max = 40, each = 240): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [])
    .map((x) => str(x, each))
    .filter(Boolean)
    .slice(0, max);
const objects = (v: unknown, max = 20): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, max);

export function normalizeResume(raw: unknown): ResumeData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (r['contact'] && typeof r['contact'] === 'object' ? r['contact'] : {}) as Record<string, unknown>;

  let skills: ResumeSkillGroup[] = objects(r['skills'], 8)
    .map((g) => ({ group: str(g['group'], 40) || 'Skills', items: list(g['items'], 30, 60) }))
    .filter((g) => g.items.length);
  if (!skills.length) {
    const flat = list(r['skills'], 30, 60);
    if (flat.length) {
      skills = [{ group: 'Skills', items: flat }];
    }
  }

  const data: ResumeData = {
    name: str(r['name'], 80),
    title: str(r['title'], 90),
    contact: {
      email: str(c['email'], 100),
      phone: str(c['phone'], 40),
      location: str(c['location'], 80),
      links: list(c['links'], 4, 100),
    },
    summary: str(r['summary'], 700),
    skills,
    experience: objects(r['experience'], 10).map((e) => ({
      role: str(e['role'], 90),
      company: str(e['company'], 90),
      location: str(e['location'], 70),
      dates: str(e['dates'], 40),
      bullets: list(e['bullets'], 6, 260),
    })),
    education: objects(r['education'], 6).map((e) => ({
      degree: str(e['degree'], 120),
      school: str(e['school'], 120),
      dates: str(e['dates'], 40),
      details: str(e['details'], 240),
    })),
    projects: objects(r['projects'], 6).map((p) => ({
      name: str(p['name'], 90),
      description: str(p['description'], 320),
      tech: str(p['tech'], 120),
    })),
    certifications: list(r['certifications'], 10, 140),
    languages: list(r['languages'], 8, 40),
  };

  const d = (r['design'] && typeof r['design'] === 'object' ? r['design'] : {}) as Record<string, unknown>;
  const template = String(d['template'] ?? '').toLowerCase() as ResumeTemplate;
  const accent = accentFromName(d['accent']);
  const order = (Array.isArray(d['order']) ? d['order'] : [])
    .map((k) => String(k).toLowerCase() as SectionKey)
    .filter((k, i, all) => sectionKeys.includes(k) && all.indexOf(k) === i);
  const paperKey = String(d['paper'] ?? '').toLowerCase().trim();
  const paper = PAPERS.some((p) => p.key === paperKey) || /^custom-\d+x\d+$/.test(paperKey) ? paperOf(paperKey).key : detectPaper(paperKey);
  if (TEMPLATES.some((t) => t.key === template) || accent || order.length || paper) {
    data.design = { template: TEMPLATES.some((t) => t.key === template) ? template : undefined, accent, order: order.length ? order : undefined, paper };
  }
  const photo = r['photo'];
  if (typeof photo === 'string' && /^data:image\/(jpeg|png);base64,/.test(photo) && photo.length < 300000) {
    data.photo = photo;
  }

  data.experience = data.experience.filter((e) => e.role || e.company);
  data.education = data.education.filter((e) => e.degree || e.school);
  data.projects = data.projects.filter((p) => p.name);

  const hasContent = data.summary || data.skills.length || data.experience.length || data.education.length || data.projects.length;
  if (!data.name && !hasContent) {
    throw new Error('The answer did not contain a resume.');
  }
  if (!data.name) {
    data.name = 'Your Name';
  }
  return data;
}

export function parseResumeJson(text: string): ResumeData {
  const cleaned = (text ?? '').replace(/```(?:json)?/gi, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a === -1 || b <= a) {
    throw new Error('No JSON found.');
  }
  const body = cleaned.slice(a, b + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const fixed = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    parsed = JSON.parse(fixed);
  }
  return normalizeResume(parsed);
}

export function resumeToText(d: ResumeData): string {
  const out: string[] = [d.name, [d.title].filter(Boolean).join('')];
  const contact = [d.contact.email, d.contact.phone, d.contact.location, ...d.contact.links].filter(Boolean).join(' | ');
  if (contact) {
    out.push(contact);
  }
  if (d.summary) {
    out.push('', 'PROFESSIONAL SUMMARY', d.summary);
  }
  if (d.skills.length) {
    out.push('', 'SKILLS', ...d.skills.map((g) => `${g.group}: ${g.items.join(', ')}`));
  }
  if (d.experience.length) {
    out.push('', 'WORK EXPERIENCE');
    for (const e of d.experience) {
      out.push(`${e.role}, ${e.company}${e.location ? ', ' + e.location : ''} (${e.dates})`, ...e.bullets.map((b) => `- ${b}`));
    }
  }
  if (d.education.length) {
    out.push('', 'EDUCATION', ...d.education.map((e) => `${e.degree}, ${e.school} (${e.dates})${e.details ? ' - ' + e.details : ''}`));
  }
  if (d.projects.length) {
    out.push('', 'PROJECTS', ...d.projects.map((p) => `${p.name}: ${p.description}${p.tech ? ' [' + p.tech + ']' : ''}`));
  }
  if (d.certifications.length) {
    out.push('', 'CERTIFICATIONS', ...d.certifications.map((c) => `- ${c}`));
  }
  if (d.languages.length) {
    out.push('', 'LANGUAGES', d.languages.join(', '));
  }
  return out.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

export function sectionOrder(d: ResumeData): SectionKey[] {
  const fallback: SectionKey[] = d.experience.length
    ? ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages']
    : ['summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'languages'];
  const chosen = d.design?.order ?? [];
  return [...chosen, ...fallback.filter((k) => !chosen.includes(k))];
}
