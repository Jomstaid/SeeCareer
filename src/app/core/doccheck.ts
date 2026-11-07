import { Job } from './models';
import { hashId } from './job.service';

/** What kind of document the user gave us. */
export type DocType = 'resume' | 'cover_letter' | 'job_posting' | 'job_related' | 'not_job_related';

export interface DocVerdict {
  type: DocType;
  /** 0-100: how sure we are. */
  confidence: number;
  /** Short plain-language reason. */
  reason: string;
  /** Who decided: the AI, or the built-in rules (when the AI is not available). */
  source: 'ai' | 'rules';
}

export const DOC_LABELS: Record<DocType, string> = {
  resume: 'Resume / CV',
  cover_letter: 'Cover letter',
  job_posting: 'Job posting',
  job_related: 'Job-related document',
  not_job_related: 'Not job related',
};

const SECTION_WORDS =
  /\b(work experience|professional experience|employment history|work history|experience|education|skills|technical skills|summary|professional summary|objective|career objective|profile|projects|certifications?|references|achievements|awards|languages|training|seminars?)\b/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const YEARS = /\b(19|20)\d{2}\b\s*(-|–|—|to)\s*(\b(19|20)\d{2}\b|present|current|now)/gi;
const JOB_POST = /\b(we are (looking|hiring)|responsibilities|requirements|qualifications|what you('| wi)ll do|about the role|benefits|apply (now|today)|job description|equal opportunity|how to apply)\b/gi;
const COVER = /\b(dear (hiring|sir|madam|mr|ms|mrs)|sincerely|i am writing to (apply|express)|yours (truly|faithfully)|respectfully yours)\b/gi;

function count(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

/**
 * Fast offline check using simple rules (contact details, resume sections, date ranges...).
 * Used before the AI check and as a fallback when the AI cannot be reached.
 */
export function ruleVerdict(text: string): DocVerdict {
  const t = text ?? '';
  const words = wordCount(t);
  if (words < 15) {
    return { type: 'not_job_related', confidence: 70, reason: 'There is almost no text in it.', source: 'rules' };
  }
  const sections = new Set((t.match(SECTION_WORDS) ?? []).map((s) => s.toLowerCase())).size;
  const contact = (EMAIL.test(t) ? 1 : 0) + (PHONE.test(t) ? 1 : 0);
  const ranges = count(t, YEARS);
  const bullets = (t.match(/^\s*[-•*·▪]\s+/gm) ?? []).length;
  const post = new Set((t.match(JOB_POST) ?? []).map((s) => s.toLowerCase())).size;
  const cover = new Set((t.match(COVER) ?? []).map((s) => s.toLowerCase())).size;

  const resumeScore = Math.min(100, sections * 14 + contact * 14 + Math.min(ranges, 3) * 8 + Math.min(bullets, 6) * 3 + (words >= 80 && words <= 2500 ? 8 : 0));
  if (cover >= 2 || (cover >= 1 && /\bdear\b/i.test(t) && sections < 2)) {
    return { type: 'cover_letter', confidence: 70, reason: 'It reads like a letter to an employer.', source: 'rules' };
  }
  if (post >= 3 && sections < 3) {
    return { type: 'job_posting', confidence: 70, reason: 'It lists job duties and requirements.', source: 'rules' };
  }
  if (resumeScore >= 55) {
    return { type: 'resume', confidence: Math.min(95, resumeScore), reason: 'It has contact details and resume sections.', source: 'rules' };
  }
  if (resumeScore >= 35) {
    return { type: 'job_related', confidence: 50, reason: 'It has a few resume-like parts but is not clearly a resume.', source: 'rules' };
  }
  return { type: 'not_job_related', confidence: 70, reason: 'It has no contact details, work history or resume sections.', source: 'rules' };
}

/** True when the text is clearly a resume (used before saving it as "my resume"). */
export function looksLikeResume(text: string): boolean {
  const v = ruleVerdict(text);
  return v.type === 'resume' || (v.type === 'job_related' && v.confidence >= 50);
}

/** Reads the AI's JSON answer about a document. Returns null when it cannot be understood. */
export function parseVerdict(raw: string): DocVerdict | null {
  const match = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!match) {
    return null;
  }
  try {
    const d = JSON.parse(match[0]) as { type?: string; confidence?: number; reason?: string };
    const type = String(d.type ?? '').toLowerCase().replace(/[\s-]+/g, '_') as DocType;
    if (!(type in DOC_LABELS)) {
      return null;
    }
    return {
      type,
      confidence: Math.max(0, Math.min(100, Math.round(Number(d.confidence ?? 70)))),
      reason: String(d.reason ?? '').slice(0, 200),
      source: 'ai',
    };
  } catch {
    return null;
  }
}

/** Builds a Job from a pasted/uploaded job posting so the user can match, apply and practice for it. */
export function jobFromText(text: string, fileName = 'Uploaded job'): Job {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? fileName).replace(/^#+\s*/, '').slice(0, 90) || fileName;
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    id: hashId('upload:' + title + text.length),
    url: '',
    title,
    company_name: 'Uploaded job posting',
    company_logo: '',
    category: 'Uploaded',
    tags: [],
    job_type: '',
    publication_date: '',
    candidate_required_location: '',
    salary: '',
    description: '<p>' + escaped.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>',
  };
}
