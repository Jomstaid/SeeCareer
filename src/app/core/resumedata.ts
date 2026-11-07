/**
 * A resume as structured data. The AI fills this in; the app then lays it out in a real design
 * (PDF, Word, on-screen preview) so the look never depends on what the AI happens to write.
 */
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
  /** The layout, colour and section order the AI suggests for this person (the user can change them). */
  design?: { template?: ResumeTemplate; accent?: string; order?: SectionKey[] };
  /** A profile photo as a small data URL (found in the uploaded resume, or added by the user). */
  photo?: string;
}

export type SectionKey = 'summary' | 'skills' | 'experience' | 'education' | 'projects' | 'certifications' | 'languages';
export const SECTION_KEYS: SectionKey[] = ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages'];

export type ResumeTemplate = 'modern' | 'bold' | 'creative' | 'classic' | 'minimal' | 'executive' | 'elegant';

/** The designs. The AI picks one that suits the person; the user can change it any time. */
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

/** The shape the AI is asked to return (shown to the AI inside the prompt). */
export const RESUME_JSON_SHAPE = `{
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
  "design": { "template": "modern | bold | creative | classic | minimal | executive | elegant (choose one)", "accent": "a colour name such as Teal, or a hex like #0e7490", "order": ["summary", "experience", "education", "skills", "projects", "certifications", "languages"] }
}`;

/** Hex colour for an accent name such as "Purple". Also accepts a hex value. */
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

/** Cleans anything the AI returned into a safe, complete ResumeData. Throws when there is nothing usable. */
export function normalizeResume(raw: unknown): ResumeData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (r['contact'] && typeof r['contact'] === 'object' ? r['contact'] : {}) as Record<string, unknown>;

  let skills: ResumeSkillGroup[] = objects(r['skills'], 8)
    .map((g) => ({ group: str(g['group'], 40) || 'Skills', items: list(g['items'], 30, 60) }))
    .filter((g) => g.items.length);
  if (!skills.length) {
    const flat = list(r['skills'], 30, 60); // the AI sometimes returns a flat list
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
    .filter((k, i, all) => SECTION_KEYS.includes(k) && all.indexOf(k) === i);
  if (TEMPLATES.some((t) => t.key === template) || accent || order.length) {
    data.design = { template: TEMPLATES.some((t) => t.key === template) ? template : undefined, accent, order: order.length ? order : undefined };
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

/** Pulls the JSON object out of an AI answer (it may add words or a code fence around it). */
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
    // common slips: trailing commas, smart quotes
    const fixed = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    parsed = JSON.parse(fixed);
  }
  return normalizeResume(parsed);
}

/** Plain text version (to save as "my resume" and for AI tools). */
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

/**
 * The order the sections are shown in. The AI's choice is used when it gave one; otherwise experience comes first,
 * or education first for someone with no work experience yet. Sections missing from the AI's list are added at the end.
 */
export function sectionOrder(d: ResumeData): SectionKey[] {
  const fallback: SectionKey[] = d.experience.length
    ? ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages']
    : ['summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'languages'];
  const chosen = d.design?.order ?? [];
  return [...chosen, ...fallback.filter((k) => !chosen.includes(k))];
}
