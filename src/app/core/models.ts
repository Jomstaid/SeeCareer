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

export interface JobPage {
  jobs: Job[];
  total: number;
  hasMore: boolean;
  place?: string;
  loose?: boolean;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMode = 'general' | 'resume' | 'finder' | 'match' | 'apply' | 'gap' | 'interview';

export interface ChatAction {
  label: string;
  icon?: string;
  task?: import('./aitasks').TaskKey;
  mode?: ChatMode;
  command?: 'resume' | 'mock' | 'saveResume' | 'download' | 'more' | 'recommend' | 'useJob' | 'askAnyway' | 'design' | 'downloadResume' | 'pickPhoto' | 'findPhotoOnline';
  format?: ExportFormat;
  data?: string;
  url?: string;
}

export interface Recommendation {
  job: Job;
  score: number;
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

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  text?: string;
  images?: string[];
  pages?: number;
  preview?: string;
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  time: number;
  quote?: string;
  intro?: boolean;
  resumeFormat?: 'pdf' | 'docx';
  auto?: boolean;
  model?: string;
  error?: boolean;
  jobs?: Job[];
  score?: number;
  actions?: ChatAction[];
  attachments?: Attachment[];
  resume?: import('./resumedata').ResumeData;
  resumeDesign?: { template: import('./resumedata').ResumeTemplate; accent: string };
  fileNote?: string;
  recs?: Recommendation[];
  verdict?: DocVerdictInfo;
}

export interface Conversation {
  id: string;
  title: string;
  updated: number;
  context?: string;
  mode?: ChatMode;
  job?: Job;
  messages: ChatMessage[];
}

export interface AiProvider {
  id: string;
  name: string;
  preset: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
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
  preferPrefixes?: string[];
}

export interface ModelStatus {
  providerId: string;
  model: string;
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
  customInstructions: string;
}

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
