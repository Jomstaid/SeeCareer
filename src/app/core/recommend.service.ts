import { Injectable } from '@angular/core';

import { AiService, ApiMessage, ContentPart } from './ai.service';
import { DOC_LABELS, DocVerdict, parseVerdict, ruleVerdict } from './doc-check';
import { JobService, plainText } from './job.service';
import { AiError, Job, Recommendation } from './models';

export interface Profile {
  titles: string[];
  skills: string[];
  level: string;
  summary: string;
}

export interface RecommendResult {
  profile: Profile;
  recs: Recommendation[];
  searched: number;
}

const MAX_CANDIDATES = 24;
const RATE_TOP = 12;
const SHOW = 8;

function extractJson<T>(raw: string, open: '{' | '['): T | null {
  const close = open === '{' ? '}' : ']';
  const a = raw.indexOf(open);
  const b = raw.lastIndexOf(close);
  if (a === -1 || b <= a) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}

export function chanceOf(score: number): Recommendation['chance'] {
  return score >= 75 ? 'High' : score >= 55 ? 'Good' : score >= 35 ? 'Moderate' : 'Low';
}

/**
 * "Find me jobs I will be accepted for": reads the resume, searches real jobs for the matching titles,
 * then rates each job (skills matched, skills missing, seniority) so the best fits come first.
 * The score is an estimate to guide the user, never a promise of being hired.
 */
@Injectable({ providedIn: 'root' })
export class RecommendService {
  constructor(
    private ai: AiService,
    private jobs: JobService,
  ) {}

  /** Asks the AI whether a document is a real resume, a job posting, a cover letter, or unrelated. */
  async classify(text: string, images: string[] = [], name = ''): Promise<DocVerdict> {
    const rules = ruleVerdict(text || '');
    if (!text && !images.length) {
      return rules;
    }
    const instruction =
      'You check documents for a job-search app. Decide what this document is. Answer with JSON only:\n' +
      '{"type":"resume|cover_letter|job_posting|job_related|not_job_related","confidence":0-100,"reason":"max 18 words"}\n' +
      'resume = a real CV/resume of a person (contact details, work history or education, skills). ' +
      'job_posting = an employer\'s job ad. cover_letter = a letter applying for a job. ' +
      'job_related = other career documents (certificate, transcript, portfolio). ' +
      'not_job_related = anything else (homework, receipts, memes, random photos, articles, chats, code...). ' +
      'Be strict: a document with no personal work/education history is NOT a resume.';
    const body = `File name: ${name || '(pasted text)'}\n${text ? 'Text:\n' + text.slice(0, 5000) : '(no text: look at the picture)'}`;
    const content: string | ContentPart[] = images.length
      ? [{ type: 'text', text: body }, ...images.slice(0, 2).map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))]
      : body;
    try {
      const r = await this.ai.chat(
        [
          { role: 'system', content: instruction },
          { role: 'user', content },
        ],
        200,
        { fast: true, temperature: 0 },
      );
      const verdict = parseVerdict(r.content);
      if (verdict) {
        // if the rules are very sure it is NOT a resume, do not let a hopeful AI answer override it
        if (verdict.type === 'resume' && rules.type === 'not_job_related' && !images.length) {
          return { ...verdict, type: 'not_job_related', confidence: 60, reason: rules.reason };
        }
        return verdict;
      }
    } catch {
      /* fall back to the offline rules */
    }
    return rules;
  }

  /** Step 1: who is this person (job titles to search, skills, level). */
  async profile(resume: string, images: string[] = []): Promise<Profile> {
    const prompt =
      'Read this resume and answer with JSON only: ' +
      '{"titles":["3 to 4 specific job titles this person should apply for, best first"],' +
      '"skills":["up to 15 key skills, tools and technologies written in lowercase"],' +
      '"level":"entry|mid|senior","summary":"one line about the person"}. ' +
      'Titles must be real job titles used in job ads (for example "frontend developer", "customer support specialist").';
    const body = resume ? `RESUME:\n${resume.slice(0, 7000)}` : '(the resume is in the attached picture)';
    const content: string | ContentPart[] = images.length
      ? [{ type: 'text', text: body }, ...images.slice(0, 3).map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))]
      : body;
    const r = await this.ai.chat(
      [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      500,
      { temperature: 0.1 },
    );
    const p = extractJson<Partial<Profile>>(r.content, '{');
    const titles = (p?.titles ?? []).map(String).filter(Boolean).slice(0, 4);
    if (!titles.length) {
      throw new AiError('I could not work out which jobs fit this resume. Add more detail about your skills and experience.', 'models');
    }
    return {
      titles,
      skills: (p?.skills ?? []).map((s) => String(s).toLowerCase().trim()).filter(Boolean).slice(0, 15),
      level: String(p?.level ?? 'entry'),
      summary: String(p?.summary ?? ''),
    };
  }

  /** Whole flow. `onStep` reports progress to show in the chat. */
  async recommend(resume: string, images: string[] = [], onStep?: (text: string) => void): Promise<RecommendResult> {
    onStep?.('Reading your resume…');
    const profile = await this.profile(resume, images);

    onStep?.(`Searching jobs for ${profile.titles.slice(0, 2).join(', ')}…`);
    const lists = await Promise.all(
      profile.titles.slice(0, 3).map((t) => this.jobs.getJobs(t, 0).catch(() => ({ jobs: [] as Job[], total: 0, hasMore: false }))),
    );
    const seen = new Set<number>();
    const candidates: Job[] = [];
    for (let i = 0; i < 8; i++) {
      for (const list of lists) {
        const job = list.jobs[i];
        if (job && !seen.has(job.id) && candidates.length < MAX_CANDIDATES) {
          seen.add(job.id);
          candidates.push(job);
        }
      }
    }
    if (!candidates.length) {
      throw new AiError('I could not load jobs right now. Check your internet connection and try again.', 'network');
    }

    // quick offline pre-score so only the most promising jobs go to the AI
    const pre = candidates
      .map((job) => ({ job, ...this.localFit(job, profile) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RATE_TOP);

    onStep?.(`Checking how well you fit ${pre.length} jobs…`);
    const rated = await this.rate(pre, profile).catch(() => null);
    const recs: Recommendation[] = pre.map((p, i) => {
      const r = rated?.find((x) => x.i === i);
      const score = r ? clamp(r.score) : p.score;
      return {
        job: p.job,
        score,
        chance: chanceOf(score),
        reason: r?.reason || this.fallbackReason(p, profile),
        matched: (r?.matched?.length ? r.matched : p.matched).slice(0, 6),
        missing: (r?.missing ?? p.missing).slice(0, 4),
      };
    });
    recs.sort((a, b) => b.score - a.score);
    return { profile, recs: recs.slice(0, SHOW), searched: candidates.length };
  }

  /** Offline score: how many of the person's skills and titles appear in the job. */
  private localFit(job: Job, profile: Profile): { score: number; matched: string[]; missing: string[] } {
    const text = `${job.title} ${job.category} ${job.tags.join(' ')} ${plainText(job.description, 3000)}`.toLowerCase();
    const matched = profile.skills.filter((s) => text.includes(s));
    const titleWords = profile.titles.flatMap((t) => t.toLowerCase().split(/\s+/)).filter((w) => w.length > 3);
    const jobTitle = job.title.toLowerCase();
    const titleHit = titleWords.length ? titleWords.filter((w) => jobTitle.includes(w)).length / Math.min(titleWords.length, 4) : 0;
    const skillPart = profile.skills.length ? matched.length / Math.min(profile.skills.length, 8) : 0;
    const score = clamp(Math.round(15 + Math.min(skillPart, 1) * 50 + Math.min(titleHit, 1) * 30));
    return { score, matched, missing: [] };
  }

  private fallbackReason(p: { matched: string[] }, profile: Profile): string {
    return p.matched.length
      ? `Your skills in ${p.matched.slice(0, 3).join(', ')} appear in this job.`
      : `Matches your target role (${profile.titles[0]}). Check the requirements.`;
  }

  /** Step 3: the AI rates each job against the profile (score, why, matched and missing skills). */
  private async rate(
    items: { job: Job; score: number }[],
    profile: Profile,
  ): Promise<{ i: number; score: number; reason: string; matched: string[]; missing: string[] }[] | null> {
    const list = items
      .map(
        (p, i) =>
          `#${i} ${p.job.title} at ${p.job.company_name} | ${p.job.job_type} | ${p.job.candidate_required_location}\n` +
          `${plainText(p.job.description, 380)}`,
      )
      .join('\n\n');
    const messages: ApiMessage[] = [
      {
        role: 'system',
        content:
          'You are a strict recruiter. For each job, estimate how likely this applicant is to be shortlisted (0-100) from the fit ' +
          'between their skills, experience level and the job. Be realistic: seniority mismatch or missing core skills lowers the score a lot. ' +
          'Answer with a JSON array only, one item per job: ' +
          '[{"i":0,"score":72,"reason":"max 20 words","matched":["skill"],"missing":["skill the job wants and the applicant lacks"]}]',
      },
      {
        role: 'user',
        content:
          `APPLICANT\nLevel: ${profile.level}\nSummary: ${profile.summary}\nSkills: ${profile.skills.join(', ')}\n` +
          `Target roles: ${profile.titles.join(', ')}\n\nJOBS\n${list}`,
      },
    ];
    const r = await this.ai.chat(messages, 1800, { temperature: 0.1 });
    const arr = extractJson<{ i: number; score: number; reason?: string; matched?: string[]; missing?: string[] }[]>(r.content, '[');
    if (!arr?.length) {
      return null;
    }
    return arr.map((x) => ({
      i: Number(x.i),
      score: Number(x.score) || 0,
      reason: String(x.reason ?? ''),
      matched: (x.matched ?? []).map(String),
      missing: (x.missing ?? []).map(String),
    }));
  }

  label(type: DocVerdict['type']): string {
    return DOC_LABELS[type];
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
