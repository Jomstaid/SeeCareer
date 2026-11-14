/** Shapes of the data used across SeeCareer (TypeScript interfaces + classes). */

// ---------- Jobs (public REST API: Himalayas, no API key needed) ----------
export interface Job {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

/** Raw job from the Himalayas API. */
export interface HimalayasJob {
  title: string;
  excerpt?: string;
  companyName: string;
  companyLogo?: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string;
  currency?: string | null;
  seniority?: string[];
  locationRestrictions?: string[];
  categories?: string[];
  parentCategories?: string[];
  description?: string;
  pubDate?: number | string;
  applicationLink?: string;
  guid: string;
}

export interface HimalayasResponse {
  totalCount: number;
  offset?: number;
  limit?: number;
  jobs: HimalayasJob[];
}

/** One page of results shown in the app. */
export interface JobPage {
  jobs: Job[];
  total: number;
  hasMore: boolean;
  /** The place the search was limited to (when the user named one). */
  place?: string;
  /** True when no job was only for that place, so jobs open to anyone are included. */
  loose?: boolean;
}

// ---------- AI chat ----------
export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMode = 'general' | 'resume' | 'finder' | 'match' | 'apply' | 'gap' | 'interview';

/** A button shown under an assistant message. */
export interface ChatAction {
  label: string;
  icon?: string;
  /** Run an AI task (analyze, match, cover letter...). */
  task?: import('./aitasks').TaskKey;
  /** Switch to another mode. */
  mode?: ChatMode;
  /** Special commands. */
  command?: 'resume' | 'mock' | 'saveResume' | 'download' | 'more' | 'recommend' | 'useJob' | 'askAnyway' | 'design' | 'downloadResume' | 'pickPhoto' | 'findPhotoOnline';
  /** Output format for the download command. */
  format?: ExportFormat;
  /** Extra data (text to save, search query...). */
  data?: string;
  /** A web address the button opens in the browser. */
  url?: string;
}

/** A job suggested for the user, with the numbers behind the suggestion. */
export interface Recommendation {
  job: Job;
  /** Estimated fit, 0-100. */
  score: number;
  /** Plain-language chance label made from the score. */
  chance: 'High' | 'Good' | 'Moderate' | 'Low';
  reason: string;
  matched: string[];
  missing: string[];
}

export interface DocVerdictInfo {
  type: string;
  label: string;
  confidence: number;
  reason: string;
}

export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'md';

export type AttachmentKind = 'pdf' | 'docx' | 'image' | 'text' | 'other';

/** A file the user attached to a message. */
export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  /** Text read from the file (PDF, Word, text files). */
  text?: string;
  /** Pictures sent to the AI (photos, or pages of a scanned PDF). Not saved in history. */
  images?: string[];
  pages?: number;
  /** Picture of the first page of a PDF (kept in memory to find a profile photo; never saved in history). */
  preview?: string;
  /** For a file whose content cannot be shown as text: its name, type and size (all the AI is told). */
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  time: number;
  /** The earlier message this one replies to (shown above it, and told to the AI). */
  quote?: string;
  /** The short "what I can do here" message shown when a feature is picked. Picking another feature replaces it. */
  intro?: boolean;
  /** The format a made resume is offered in first (the other one is the second button). */
  resumeFormat?: 'pdf' | 'docx';
  /** The text was added by the app (the user sent only a file), so the bubble shows just the file. */
  auto?: boolean;
  model?: string;
  error?: boolean;
  /** Job cards shown inside the message (Job Finder). */
  jobs?: Job[];
  /** Compatibility score card (Job Matching). */
  score?: number;
  actions?: ChatAction[];
  attachments?: Attachment[];
  /** A designed resume that can be opened in the designer. */
  resume?: import('./resumedata').ResumeData;
  /** The layout and colour chosen for that resume. */
  resumeDesign?: { template: import('./resumedata').ResumeTemplate; accent: string };
  /** Small note above a message, for example that a file was downloaded. */
  fileNote?: string;
  /** Job recommendations shown as a swipeable carousel. */
  recs?: Recommendation[];
  /** Result of checking an uploaded document. */
  verdict?: DocVerdictInfo;
}

export interface Conversation {
  id: string;
  title: string;
  updated: number;
  /** Optional extra context (for example the job the user is asking about). */
  context?: string;
  mode?: ChatMode;
  /** The job the user picked to work on. */
  job?: Job;
  messages: ChatMessage[];
}

// ---------- AI providers (Settings) ----------
export interface AiProvider {
  id: string;
  name: string;
  preset: string;
  baseUrl: string;
  apiKey: string;
  /** Empty = "Auto": SeeCareer tests the models and uses the fastest working one. */
  model: string;
  enabled: boolean;
  /** Comes with the app and its own key: the key and address are locked and never shown. */
  builtin?: boolean;
}

export interface ProviderPreset {
  key: string;
  label: string;
  baseUrl: string;
  note: string;
  keyHint: string;
  signup: string;
  preferred: string[];
}

export interface ModelStatus {
  providerId: string;
  model: string;
  /** true = answered the test, false = failed, null = not tested yet. */
  ok: boolean | null;
  latency?: number;
  error?: string;
}

export interface ChatResult {
  content: string;
  model: string;
  providerName: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  maxTokens: number;
  saveHistory: boolean;
  fontSize: 'small' | 'medium' | 'large';
  /** Extra instructions added to every AI request (customizable prompts). */
  customInstructions: string;
}

// ---------- Classes ----------
export class GroupMember {
  constructor(
    public name: string,
    public role: string,
    public contribution: string,
    public photo: string,
  ) {}
}

export type AiErrorKind = 'config' | 'key' | 'network' | 'models' | 'cancelled' | 'needinfo';

export class AiError extends Error {
  constructor(
    message: string,
    public kind: AiErrorKind,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
