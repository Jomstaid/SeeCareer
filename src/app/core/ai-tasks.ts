import type { ApiMessage } from './ai.service';
import { SYSTEM_PROMPT } from './defaults';
import { plainText } from './job.service';
import { Job } from './models';

export type TaskKey = 'analyze' | 'improve' | 'skills' | 'generate' | 'match' | 'cover' | 'email' | 'gap' | 'interview' | 'evaluate';

export interface TaskContext {
  resume?: string;
  job?: Job;
  /** Extra instructions saved in Settings. */
  instructions?: string;
  question?: string;
  answer?: string;
}

export interface TaskInfo {
  key: TaskKey;
  label: string;
  icon: string;
}

export const RESUME_TASKS: TaskInfo[] = [
  { key: 'analyze', label: 'Analyze resume', icon: 'search-outline' },
  { key: 'improve', label: 'Improve wording', icon: 'create-outline' },
  { key: 'skills', label: 'Extract skills', icon: 'list-outline' },
  { key: 'generate', label: 'Generate resume (PDF/Word)', icon: 'document-outline' },
];

export const JOB_TASKS: TaskInfo[] = [
  { key: 'match', label: 'Match score', icon: 'speedometer-outline' },
  { key: 'cover', label: 'Cover letter', icon: 'document-text-outline' },
  { key: 'email', label: 'Email draft', icon: 'mail-outline' },
  { key: 'gap', label: 'Skills gap', icon: 'trending-up-outline' },
  { key: 'interview', label: 'Interview prep', icon: 'chatbubbles-outline' },
];

const TASK_TITLES: Record<TaskKey, string> = {
  analyze: 'Resume analysis',
  improve: 'Improved resume',
  skills: 'Extracted skills',
  generate: 'Generated resume',
  match: 'Job match',
  cover: 'Cover letter',
  email: 'Application email',
  gap: 'Skills gap & roadmap',
  interview: 'Interview preparation',
  evaluate: 'Answer feedback',
};

export function taskTitle(key: TaskKey): string {
  return TASK_TITLES[key];
}

function jobSummary(job: Job): string {
  return (
    `Job title: ${job.title}\nCompany: ${job.company_name}\nCategory: ${job.category}\n` +
    `Type: ${job.job_type}\nLocation: ${job.candidate_required_location || 'Anywhere'}\n` +
    `Tags: ${(job.tags ?? []).join(', ')}\nDescription: ${plainText(job.description, 2500)}`
  );
}

/** Prompt templates for each AI feature. Developers can edit them here. */
export function buildTask(key: TaskKey, ctx: TaskContext): ApiMessage[] {
  const resume = (ctx.resume ?? '').slice(0, 8000);
  const job = ctx.job ? jobSummary(ctx.job) : '';
  const extra = ctx.instructions?.trim() ? `\n\nExtra instructions from the user: ${ctx.instructions.trim()}` : '';
  const R = `RESUME:\n${resume}`;
  const J = `JOB:\n${job}`;
  let task: string;

  switch (key) {
    case 'analyze':
      task =
        'Analyze this resume. Give: 1) a short summary, 2) strengths, 3) missing information, 4) grammar or wording problems, ' +
        '5) formatting suggestions. Use short bullet points.\n\n' +
        R;
      break;
    case 'improve':
      task =
        'Rewrite this resume professionally: fix grammar, use strong action verbs, keep every fact true (do not invent anything). ' +
        'Return the improved resume in clean sections.\n\n' +
        R;
      break;
    case 'skills':
      task =
        'Extract from this resume: Skills (technical and soft), Education, Work experience, Certifications. ' +
        'Use headings and bullet lists. Write "none found" for an empty section.\n\n' +
        R;
      break;
    case 'generate':
      task =
        'Create a complete, professional, ATS-friendly resume from the information below. Use ONLY facts given; ' +
        'where something is missing write a short [placeholder]. Output markdown only, in this exact structure:\n' +
        '# Full Name\nOne line: email | phone | city | LinkedIn or portfolio\n## Professional Summary\n## Skills\n' +
        '## Work Experience (### Role - Company (dates), then bullets with action verbs)\n## Education\n## Projects\n' +
        '## Certifications\nDo not add any text before or after the resume.\n\n' +
        R;
      break;
    case 'match':
      task =
        'Compare the resume with the job. Start the answer with exactly one line: "SCORE: <number from 0 to 100>". ' +
        'Then give these headings: Why it matches, Possible mismatches, Recommendation. Be honest and specific.\n\n' +
        R +
        '\n\n' +
        J;
      break;
    case 'cover':
      task =
        'Write a personalized cover letter (under 250 words) for this job, using only facts from the resume. ' +
        'Leave [Your Name] as a placeholder at the end.\n\n' +
        R +
        '\n\n' +
        J;
      break;
    case 'email':
      task =
        'Write a short professional application email (subject line + body, under 150 words) for this job, using only facts from the resume.\n\n' +
        R +
        '\n\n' +
        J;
      break;
    case 'gap':
      task =
        'Find the skills this applicant is missing for this job. Give: Missing skills, Skills already strong, ' +
        'and a personalized 8-week learning roadmap (week by week, short).\n\n' +
        R +
        '\n\n' +
        J;
      break;
    case 'interview':
      task =
        'Prepare the applicant for an interview for this job: 5 technical questions and 5 behavioral questions, ' +
        'each with a short suggested answer based on the resume. Number the questions.\n\n' +
        R +
        '\n\n' +
        J;
      break;
    case 'evaluate':
      task =
        'Evaluate this interview answer for the job. Give: Score out of 10, What was good, What to improve, and a better version.\n\n' +
        `Question: ${ctx.question ?? ''}\nAnswer: ${ctx.answer ?? ''}\n\n${J}`;
      break;
  }
  return [
    { role: 'system', content: SYSTEM_PROMPT + extra },
    { role: 'user', content: task },
  ];
}

/** Reads "SCORE: 78" from the start of a match answer. Returns null when it is missing. */
export function parseScore(text: string): number | null {
  const m = /SCORE:\s*(\d{1,3})/i.exec(text);
  return m ? Math.min(100, Number(m[1])) : null;
}

export function stripScore(text: string): string {
  return text.replace(/^\s*SCORE:\s*\d{1,3}\s*(\/\s*100)?\s*\n?/i, '').trim();
}
