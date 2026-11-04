import { jobFromText, looksLikeResume, parseVerdict, ruleVerdict } from './doc-check';
import { smartRank } from './ai.service';
import { chanceOf } from './recommend.service';

const RESUME = `Juan Dela Cruz
juan.delacruz@email.com | +63 912 345 6789 | Cabanatuan City

PROFESSIONAL SUMMARY
BSIT student with Angular and TypeScript experience.

SKILLS
- Angular, Ionic, TypeScript, HTML, CSS

WORK EXPERIENCE
Junior Web Developer Intern, Acme Corp, 2024 - Present
- Built mobile screens with Ionic and Angular
- Fixed bugs and wrote unit tests

EDUCATION
BS Information Technology, NEUST, 2022 - 2026`;

const HOMEWORK =
  'The mitochondria is the powerhouse of the cell. In this essay we discuss how cells produce energy and why this matters for biology students in the first semester of the school year.';

const POSTING = `Frontend Developer
We are looking for a developer to join our team.
Responsibilities: build user interfaces.
Requirements: 2 years of Angular.
Qualifications: BS in IT.
Benefits: health insurance. Apply now today.`;

describe('document check (rules)', () => {
  it('recognises a real resume', () => {
    expect(ruleVerdict(RESUME).type).toBe('resume');
    expect(looksLikeResume(RESUME)).toBe(true);
  });

  it('rejects text that is not job related', () => {
    expect(ruleVerdict(HOMEWORK).type).toBe('not_job_related');
    expect(looksLikeResume(HOMEWORK)).toBe(false);
    expect(ruleVerdict('hello').type).toBe('not_job_related');
  });

  it('recognises a job posting and a cover letter', () => {
    expect(ruleVerdict(POSTING).type).toBe('job_posting');
    expect(ruleVerdict('Dear Hiring Manager,\nI am writing to apply for the role of designer at your company because I love design and have worked on many projects.\nSincerely,\nAna').type).toBe('cover_letter');
  });
});

describe('AI answer parsing and helpers', () => {
  it('reads the AI verdict JSON, even with extra words around it', () => {
    const v = parseVerdict('Sure! {"type":"not_job_related","confidence":91,"reason":"A school essay"} done');
    expect(v?.type).toBe('not_job_related');
    expect(v?.confidence).toBe(91);
    expect(parseVerdict('no json here')).toBeNull();
    expect(parseVerdict('{"type":"banana"}')).toBeNull();
  });

  it('ranks the largest models first and lite models last', () => {
    expect(smartRank('antigravity/claude-sonnet-4-6')).toBeLessThan(smartRank('antigravity/gemini-3.8-flash-high'));
    expect(smartRank('antigravity/gemini-3.8-flash-high')).toBeLessThan(smartRank('antigravity/gemini-3.5-flash-lite'));
  });

  it('turns a score into a chance label', () => {
    expect(chanceOf(90)).toBe('High');
    expect(chanceOf(60)).toBe('Good');
    expect(chanceOf(40)).toBe('Moderate');
    expect(chanceOf(10)).toBe('Low');
  });

  it('builds a job from an uploaded posting', () => {
    const job = jobFromText(POSTING);
    expect(job.title).toBe('Frontend Developer');
    expect(job.description).toContain('Angular');
  });
});
