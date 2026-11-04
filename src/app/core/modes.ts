import { ChatAction, ChatMode } from './models';

/** The six AI features from the project plan, as chat modes. */
export interface ModeInfo {
  key: ChatMode;
  label: string;
  /** One line shown in the feature list. */
  blurb: string;
  short: string;
  icon: string;
  /** Tile / chip colour (CSS colour). */
  color: string;
  intro: string;
  placeholder: string;
  needsResume: boolean;
  needsJob: boolean;
  starters: string[];
  actions: ChatAction[];
  /** Extra instruction added to the AI for this mode. */
  system: string;
}

export const MODES: ModeInfo[] = [
  {
    key: 'resume',
    label: 'Resume Assistant',
    blurb: 'Analyze, improve and generate your resume as PDF or Word.',
    short: 'Resume',
    icon: 'document-text',
    color: '#6366f1',
    intro:
      'I can **analyze** your resume, **improve** it, **extract your skills**, and **generate a new resume as PDF or Word**. Add your resume (or upload a PDF, Word file or photo of it with the paperclip button), then pick an action.',
    placeholder: 'Ask about your resume…',
    needsResume: true,
    needsJob: false,
    starters: ['How can I make my summary stronger?', 'What is missing from my resume?'],
    actions: [
      { label: 'Add / edit resume', icon: 'create', command: 'resume' },
      { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
      { label: 'Analyze', icon: 'search', task: 'analyze' },
      { label: 'Improve wording', icon: 'color-wand', task: 'improve' },
      { label: 'Extract skills', icon: 'list', task: 'skills' },
      { label: 'Generate resume PDF', icon: 'document', task: 'generate' },
    ],
    system: 'The user wants help with their resume. Be specific and never invent facts.',
  },
  {
    key: 'finder',
    label: 'Job Finder',
    blurb: 'Search real jobs, or get picks that fit your resume.',
    short: 'Find jobs',
    icon: 'search',
    color: '#06b6d4',
    intro:
      'Tell me what job you want, for example **“python developer”** or **“customer support”**. Or upload your resume and say **“find me a job I will get accepted for”**: I will pick the jobs you fit best and show your fit %.',
    placeholder: 'Job title or skill, e.g. frontend developer',
    needsResume: false,
    needsJob: false,
    starters: ['Frontend developer', 'Data analyst', 'Customer support', 'Content writer'],
    actions: [{ label: 'Recommend jobs from my resume', icon: 'rocket', command: 'recommend' }],
    system: 'The user is searching for jobs. Keep answers short.',
  },
  {
    key: 'match',
    label: 'Job Matching',
    blurb: 'See how well you fit a job, with a score.',
    short: 'Match',
    icon: 'speedometer',
    color: '#10b981',
    intro:
      'I compare your resume with a job and give a **compatibility score**, why it fits, and what does not. Choose a job first (use Job Finder), then tap Match.',
    placeholder: 'Ask about this match…',
    needsResume: true,
    needsJob: true,
    starters: ['Why is my score not higher?', 'Which jobs fit me best?'],
    actions: [
      { label: 'Find a job', icon: 'search', mode: 'finder' },
      { label: 'Match now', icon: 'speedometer', task: 'match' },
    ],
    system: 'The user is checking how well they match a job. Be honest and specific.',
  },
  {
    key: 'apply',
    label: 'Application Assistant',
    blurb: 'Cover letters, emails and application answers.',
    short: 'Apply',
    icon: 'mail',
    color: '#f59e0b',
    intro:
      'I write a **cover letter** or **application email** for the selected job using only facts from your resume. Paste an application question and I will answer it too.',
    placeholder: 'Paste an application question…',
    needsResume: true,
    needsJob: true,
    starters: ['Why do you want to work here?', 'Tell us about yourself.'],
    actions: [
      { label: 'Cover letter', icon: 'document', task: 'cover' },
      { label: 'Email draft', icon: 'mail', task: 'email' },
    ],
    system:
      'The user is applying for the selected job. Answer application questions in first person, using only facts from the resume.',
  },
  {
    key: 'gap',
    label: 'Skills Gap Analyzer',
    blurb: 'Find missing skills and get a learning plan.',
    short: 'Skills gap',
    icon: 'trending-up',
    color: '#ec4899',
    intro:
      'I find the skills you are **missing** for the selected job and build an **8-week learning roadmap**. Pick a job first.',
    placeholder: 'Ask about a skill or roadmap…',
    needsResume: true,
    needsJob: true,
    starters: ['What should I learn first?', 'Suggest free courses for the gaps.'],
    actions: [
      { label: 'Find a job', icon: 'search', mode: 'finder' },
      { label: 'Analyze my gap', icon: 'trending-up', task: 'gap' },
    ],
    system: 'The user wants a skills gap analysis and learning plan for the selected job.',
  },
  {
    key: 'interview',
    label: 'Interview Preparation',
    blurb: 'Likely questions, plus a mock interview with scores.',
    short: 'Interview',
    icon: 'chatbubbles',
    color: '#8b5cf6',
    intro:
      'Get a **list of likely questions** with suggested answers, or start a **mock interview**: I ask one question at a time and score each answer.',
    placeholder: 'Type your answer…',
    needsResume: true,
    needsJob: true,
    starters: [],
    actions: [
      { label: 'Start mock interview', icon: 'mic', command: 'mock' },
      { label: 'Question list', icon: 'list', task: 'interview' },
    ],
    system: 'The user is preparing for an interview for the selected job.',
  },
];

export const GENERAL_MODE: ModeInfo = {
  key: 'general',
  label: 'SeeCareer AI',
    blurb: '',
  short: 'Chat',
  icon: 'sparkles',
  color: '#6366f1',
  intro: '',
  placeholder: 'Ask anything about your career…',
  needsResume: false,
  needsJob: false,
  starters: [],
  actions: [],
  system: '',
};

export function modeInfo(key: ChatMode): ModeInfo {
  return MODES.find((m) => m.key === key) ?? GENERAL_MODE;
}

/** Instruction used when the user starts a mock interview. */
export const MOCK_INTERVIEW_SYSTEM =
  'You are a friendly but realistic interviewer for the selected job. Ask ONE interview question at a time. ' +
  'After the user answers, reply with: "Score: X/10", one line of what was good, one line to improve, then ask the next question. ' +
  'Start now with the first question only.';
