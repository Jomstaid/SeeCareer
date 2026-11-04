import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';

import { HimalayasJob, HimalayasResponse, Job, JobPage } from './models';
import { readJson, writeJson } from './storage';

/**
 * Himalayas public jobs API (no key, about 100,000+ remote jobs).
 * On the phone the full URL is used (native HTTP, no CORS). In the browser (`ionic serve`)
 * requests go through the dev proxy in proxy.conf.json because Himalayas does not send CORS headers.
 */
const BASE = Capacitor.isNativePlatform() ? 'https://himalayas.app' : '/himalayas';
export const JOBS_SOURCE = { name: 'Himalayas', url: 'https://himalayas.app', endpoint: 'https://himalayas.app/jobs/api' };
export const BACKUP_SOURCE = { name: 'RemoteOK & Arbeitnow', url: 'https://remoteok.com', endpoint: 'https://remoteok.com/api' };

interface RemoteOkItem {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  company_logo?: string;
  logo?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
  date?: string;
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links?: { next?: string | null };
}

export const PAGE_SIZE = 20;
const SAVED_KEY = 'seecareer.savedJobs';
const CACHE_KEY = 'seecareer.jobCache';
const CACHE_MAX = 300;

/** Quick filters shown on the Jobs page (they become search keywords). */
export const QUICK_FILTERS: { label: string; query: string }[] = [
  { label: 'All jobs', query: '' },
  { label: 'Software development', query: 'software engineer' },
  { label: 'Web / frontend', query: 'frontend developer' },
  { label: 'Data & analytics', query: 'data analyst' },
  { label: 'Design', query: 'designer' },
  { label: 'Customer support', query: 'customer support' },
  { label: 'Marketing', query: 'marketing' },
  { label: 'Sales', query: 'sales' },
  { label: 'Writing & content', query: 'writer' },
  { label: 'Virtual assistant', query: 'virtual assistant' },
  { label: 'Finance & accounting', query: 'accountant' },
  { label: 'Human resources', query: 'recruiter' },
  { label: 'IT & support', query: 'it support' },
  { label: 'Teaching', query: 'teacher' },
];

/** Centralised data service: loads jobs with HttpClient GET and keeps a small cache on the phone. */
@Injectable({ providedIn: 'root' })
export class JobService {
  private cache = new Map<number, Job>(readJson<Job[]>(CACHE_KEY, []).map((j) => [j.id, j]));

  /** Ids of jobs the user bookmarked. */
  readonly savedIds = signal<number[]>(readJson<number[]>(SAVED_KEY, []));

  constructor(private http: HttpClient) {}

  /**
   * One page of jobs (20 per page).
   * No keyword: GET /jobs/api?limit=20&offset=N (the whole feed, 100k+ jobs).
   * Keyword:    GET /jobs/api/search?q=...&page=N
   */
  async getJobs(search = '', page = 0): Promise<JobPage> {
    let result: JobPage;
    if (page > 0 && this.active === 'backup') {
      result = await this.fromBackup(search, page);
    } else if (page > 0) {
      result = await this.fromHimalayas(search, page);
    } else {
      try {
        result = await this.fromHimalayas(search, 0);
        this.active = 'himalayas';
        this.source.set(JOBS_SOURCE);
      } catch (first) {
        // Himalayas unreachable (no internet, or the dev proxy is not loaded): use the backup source.
        try {
          result = await this.fromBackup(search, 0);
          this.active = 'backup';
          this.source.set(BACKUP_SOURCE);
        } catch {
          throw first;
        }
      }
    }
    result.jobs.forEach((j) => this.cache.set(j.id, j));
    this.persist();
    return result;
  }

  /** Which source answered last (shown in the credit line). */
  readonly source = signal(JOBS_SOURCE);
  private active: 'himalayas' | 'backup' = 'himalayas';

  private async fromHimalayas(search: string, page: number): Promise<JobPage> {
    const q = search.trim();
    let res: HimalayasResponse;
    if (q) {
      const params = new HttpParams().set('q', q).set('page', page + 1);
      res = await firstValueFrom(this.http.get<HimalayasResponse>(`${BASE}/jobs/api/search`, { params }));
    } else {
      const params = new HttpParams().set('limit', PAGE_SIZE).set('offset', page * PAGE_SIZE);
      res = await firstValueFrom(this.http.get<HimalayasResponse>(`${BASE}/jobs/api`, { params }));
    }
    if (!res || !Array.isArray(res.jobs)) {
      throw new Error('Unexpected jobs response');
    }
    const jobs = res.jobs.map(toJob);
    const total = res.totalCount ?? jobs.length;
    return { jobs, total, hasMore: jobs.length > 0 && (page + 1) * PAGE_SIZE < total };
  }

  /**
   * Backup source: Arbeitnow + RemoteOK (both free and allow browser requests). They have no real search,
   * so they are loaded ONCE into a shared pool and the keyword ranks the jobs in memory.
   */
  private async fromBackup(search: string, page: number): Promise<JobPage> {
    const pool = await this.loadPool();
    const words = search
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 1);
    let list = pool;
    if (words.length) {
      list = pool
        .map((job) => {
          const text = `${job.title} ${job.company_name} ${job.tags.join(' ')} ${job.category} ${plainText(job.description, 400)}`.toLowerCase();
          const inTitle = words.filter((w) => job.title.toLowerCase().includes(w)).length;
          return { job, score: words.filter((w) => text.includes(w)).length + inTitle };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.job);
    }
    const jobs = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return { jobs, total: list.length, hasMore: (page + 1) * PAGE_SIZE < list.length };
  }

  private pool: Job[] | null = null;
  private poolLoading?: Promise<Job[]>;

  private async loadPool(): Promise<Job[]> {
    if (this.pool) {
      return this.pool;
    }
    this.poolLoading ??= (async () => {
      const [arbeit, remoteok] = await Promise.allSettled([
        firstValueFrom(this.http.get<ArbeitnowResponse>('https://www.arbeitnow.com/api/job-board-api')),
        firstValueFrom(this.http.get<RemoteOkItem[]>('https://remoteok.com/api')),
      ]);
      const jobs: Job[] = [];
      if (remoteok.status === 'fulfilled' && Array.isArray(remoteok.value)) {
        jobs.push(...remoteok.value.filter((x) => x && x.id && x.position).map(toJobFromRemoteOk));
      }
      if (arbeit.status === 'fulfilled' && Array.isArray(arbeit.value?.data)) {
        jobs.push(...arbeit.value.data.map(toJobFromArbeitnow));
      }
      if (!jobs.length) {
        throw new Error('Backup jobs unavailable');
      }
      this.pool = jobs;
      return jobs;
    })();
    try {
      return await this.poolLoading;
    } finally {
      if (!this.pool) {
        this.poolLoading = undefined; // allow a retry later
      }
    }
  }


  /** Finds a job that was already loaded (it stays cached on the phone). */
  async getJob(id: number): Promise<Job | undefined> {
    return this.cache.get(id);
  }

  peek(id: number): Job | undefined {
    return this.cache.get(id);
  }

  /** Puts a job (for example one restored from saved chats) back in the cache. */
  remember(job: Job): void {
    if (!this.cache.has(job.id)) {
      this.cache.set(job.id, job);
      this.persist();
    }
  }

  savedJobs(): Job[] {
    return this.savedIds()
      .map((id) => this.cache.get(id))
      .filter((j): j is Job => !!j);
  }

  isSaved(id: number): boolean {
    return this.savedIds().includes(id);
  }

  toggleSaved(id: number): void {
    const ids = this.isSaved(id) ? this.savedIds().filter((x) => x !== id) : [...this.savedIds(), id];
    this.savedIds.set(ids);
    writeJson(SAVED_KEY, ids);
    this.persist();
  }

  /** Keeps saved jobs plus the most recent ones, with shorter descriptions, so storage stays small. */
  private persist(): void {
    const saved = new Set(this.savedIds());
    const all = [...this.cache.values()];
    const keep = [...all.filter((j) => saved.has(j.id)), ...all.filter((j) => !saved.has(j.id)).slice(-CACHE_MAX)];
    writeJson(
      CACHE_KEY,
      keep.map((j) => ({ ...j, description: (j.description ?? '').slice(0, 6000) })),
    );
  }
}

// ---------- helpers ----------
/** Stable number id from the job's URL (Himalayas has no numeric id). */
export function hashId(text: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (h2 * 31 + c) % 2097152;
  }
  return h2 * 4294967296 + h1;
}

const pretty = (s: string) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

function money(n: number | null | undefined, currency?: string | null): string {
  if (!n) {
    return '';
  }
  return `${currency ?? 'USD'} ${Math.round(n).toLocaleString()}`;
}

/** Converts a RemoteOK job into the app's Job interface. */
export function toJobFromRemoteOk(r: RemoteOkItem): Job {
  const tags = (r.tags ?? []).filter(Boolean);
  const salary = r.salary_min && r.salary_max ? `USD ${r.salary_min.toLocaleString()} – ${r.salary_max.toLocaleString()} / year` : '';
  return {
    id: hashId('remoteok:' + (r.id ?? r.slug ?? r.position)),
    url: r.apply_url || r.url || 'https://remoteok.com',
    title: r.position ?? 'Remote job',
    company_name: r.company ?? '',
    company_logo: r.company_logo || r.logo || '',
    category: tags[0] ?? 'Remote',
    tags: tags.slice(1, 8),
    job_type: 'Full Time',
    publication_date: r.date ?? '',
    candidate_required_location: r.location || 'Worldwide',
    salary,
    description: r.description ?? '',
  };
}

/** Converts a backup-source (Arbeitnow) job into the app's Job interface. */
export function toJobFromArbeitnow(a: ArbeitnowJob): Job {
  const tags = a.tags ?? [];
  const where = [a.remote ? 'Remote' : '', a.location ?? ''].filter(Boolean).join(' · ');
  return {
    id: hashId(a.slug || a.url),
    url: a.url,
    title: a.title,
    company_name: a.company_name,
    company_logo: '',
    category: tags[0] ?? 'Jobs',
    tags: tags.slice(1, 8),
    job_type: (a.job_types ?? [])[0] ?? '',
    publication_date: a.created_at ? new Date(a.created_at * 1000).toISOString() : '',
    candidate_required_location: where || 'See posting',
    salary: '',
    description: a.description ?? '',
  };
}

/** Converts the API's job shape into the app's Job interface. */
export function toJob(h: HimalayasJob): Job {
  const locations = h.locationRestrictions ?? [];
  const location = locations.length
    ? locations.slice(0, 3).join(', ') + (locations.length > 3 ? ` +${locations.length - 3} more` : '')
    : 'Worldwide';
  const min = money(h.minSalary, h.currency);
  const max = money(h.maxSalary, h.currency);
  const categories = [...(h.parentCategories ?? []), ...(h.categories ?? [])].map(pretty);
  return {
    id: hashId(h.guid || h.applicationLink || h.title + h.companyName),
    url: h.applicationLink || h.guid,
    title: h.title,
    company_name: h.companyName,
    company_logo: h.companyLogo ?? '',
    category: categories[0] ?? 'Remote',
    tags: [...new Set([...(h.seniority ?? []), ...categories.slice(1)])].slice(0, 8),
    job_type: h.employmentType ?? '',
    publication_date: h.pubDate ? new Date(Number(h.pubDate) * 1000).toISOString() : '',
    candidate_required_location: location,
    salary: min && max ? `${min} – ${max} / ${h.salaryPeriod ?? 'year'}` : min || max,
    description: h.description || h.excerpt || '',
  };
}

/** Turns a failed request into a message the user can understand. */
export function describeHttpError(error: unknown): string {
  const e = error as { status?: number };
  if (e?.status === 0) {
    return 'No internet connection or the jobs server cannot be reached.';
  }
  if (e?.status && e.status >= 500) {
    return 'The jobs server is having problems. Please try again later.';
  }
  if (e?.status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return 'Something went wrong while loading jobs.';
}

/** Plain-text preview of a job description (the API returns HTML). */
export function plainText(html: string, max = 160): string {
  const text = (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
