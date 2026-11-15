import { Job } from './models';
import { hashId } from './job.service';

export type DocType = 'resume' | 'coverLetter' | 'jobPosting' | 'jobRelated' | 'notJobRelated';

export interface DocVerdict {
  type: DocType;
  confidence: number;
  reason: string;
  source: 'ai' | 'rules';
}

export const docLabels: Record<DocType, string> = {
  resume: 'Resume / CV',
  coverLetter: 'Cover letter',
  jobPosting: 'Job posting',
  jobRelated: 'Job-related document',
  notJobRelated: 'Not job related',
};

const sectionWords =
  /\b(work experience|professional experience|employment history|work history|experience|education|skills|technical skills|summary|professional summary|objective|career objective|profile|projects|certifications?|references|achievements|awards|languages|training|seminars?)\b/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const YEARS = /\b(19|20)\d{2}\b\s*(-|–|—|to)\s*(\b(19|20)\d{2}\b|present|current|now)/gi;
const jobPost = /\b(we are (looking|hiring)|responsibilities|requirements|qualifications|what you('| wi)ll do|about the role|benefits|apply (now|today)|job description|equal opportunity|how to apply)\b/gi;
const COVER = /\b(dear (hiring|sir|madam|mr|ms|mrs)|sincerely|i am writing to (apply|express)|yours (truly|faithfully)|respectfully yours)\b/gi;

function count(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

export function ruleVerdict(text: string): DocVerdict {
  const t = text ?? '';
  const words = wordCount(t);
  if (words < 15) {
    return { type: 'notJobRelated', confidence: 70, reason: 'There is almost no text in it.', source: 'rules' };
  }
  const sections = new Set((t.match(sectionWords) ?? []).map((s) => s.toLowerCase())).size;
  const contact = (EMAIL.test(t) ? 1 : 0) + (PHONE.test(t) ? 1 : 0);
  const ranges = count(t, YEARS);
  const bullets = (t.match(/^\s*[-•*·▪]\s+/gm) ?? []).length;
  const post = new Set((t.match(jobPost) ?? []).map((s) => s.toLowerCase())).size;
  const cover = new Set((t.match(COVER) ?? []).map((s) => s.toLowerCase())).size;

  const resumeScore = Math.min(100, sections * 14 + contact * 14 + Math.min(ranges, 3) * 8 + Math.min(bullets, 6) * 3 + (words >= 80 && words <= 2500 ? 8 : 0));
  if (cover >= 2 || (cover >= 1 && /\bdear\b/i.test(t) && sections < 2)) {
    return { type: 'coverLetter', confidence: 70, reason: 'It reads like a letter to an employer.', source: 'rules' };
  }
  if (post >= 3 && sections < 3) {
    return { type: 'jobPosting', confidence: 70, reason: 'It lists job duties and requirements.', source: 'rules' };
  }
  if (resumeScore >= 55) {
    return { type: 'resume', confidence: Math.min(95, resumeScore), reason: 'It has contact details and resume sections.', source: 'rules' };
  }
  if (resumeScore >= 35) {
    return { type: 'jobRelated', confidence: 50, reason: 'It has a few resume-like parts but is not clearly a resume.', source: 'rules' };
  }
  return { type: 'notJobRelated', confidence: 70, reason: 'It has no contact details, work history or resume sections.', source: 'rules' };
}

export function looksLikeResume(text: string): boolean {
  const v = ruleVerdict(text);
  return v.type === 'resume' || (v.type === 'jobRelated' && v.confidence >= 50);
}

export function parseVerdict(raw: string): DocVerdict | null {
  const match = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!match) {
    return null;
  }
  try {
    const d = JSON.parse(match[0]) as { type?: string; confidence?: number; reason?: string };
    const plain = String(d.type ?? '').toLowerCase().replace(/[\s_-]+/g, '');
    const type = (Object.keys(docLabels) as DocType[]).find((k) => k.toLowerCase() === plain);
    if (!type) {
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
