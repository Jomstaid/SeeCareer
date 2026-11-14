import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Place, placeByCode, splitPlace } from './places';
import { HimalayasJob, HimalayasResponse, Job, JobPage } from './models';
import { readJson, writeJson } from './storage';

/**
 * Himalayas public jobs API (no key, about 100,000+ remote jobs).
 * On the phone the app calls it with native HTTP, which has no CORS limit, so the full list works.
 * A browser page is blocked from calling it directly (Himalayas sends no CORS headers); the app then
 * falls back to a second source (see BACKUP_SOURCE), so the Jobs page still has jobs.
 */
const BASE = 'https://himalayas.app';
export const JOBS_SOURCE = { name: 'Himalayas', url: 'https://himalayas.app', endpoint: 'https://himalayas.app/jobs/api' };
export const BACKUP_SOURCE = { name: 'Remotive, Jobicy, RemoteOK & Arbeitnow', url: 'https://remotive.com', endpoint: 'https://remotive.com/api/remote-jobs' };

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

interface RemotiveJob {
  id: number | string;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface JobicyJob {
  id: number | string;
  url: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
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
  private http = inject(HttpClient);

  private cache = new Map<number, Job>(readJson<Job[]>(CACHE_KEY, []).map((j) => [j.id, j]));

  /** Ids of jobs the user bookmarked. */
  readonly savedIds = signal<number[]>(readJson<number[]>(SAVED_KEY, []));

  /**
   * One page of jobs (20 per page).
   * No keyword: GET /jobs/api?limit=20&offset=N (the whole feed, 100k+ jobs).
   * Keyword:    GET /jobs/api/search?q=...&page=N
   */
  async getJobs(search = '', page = 0, country?: string): Promise<JobPage> {
    // "developer in Manila" becomes the keyword "developer" limited to the Philippines
    const split = country ? { query: search, place: null } : splitPlace(search);
    const keyword = split.query;
    const code = country ?? split.place?.code;
    const where: Place | undefined = split.place ?? (country ? placeByCode(country) ?? undefined : undefined);
    const place = where?.label;
    const key = `${search}|${code ?? ''}`;
    let result: JobPage;
    if (page > 0 && this.active === 'backup') {
      result = await this.fromBackup(keyword, page, where);
    } else if (page > 0) {
      result = await this.fromHimalayas(keyword, page, code, !this.loose.has(key));
    } else {
      try {
        result = await this.fromHimalayas(keyword, 0, code, true);
        this.loose.delete(key);
        if (code && result.jobs.length === 0) {
          // nothing only for that country: also allow remote jobs that are open to anyone
          this.loose.add(key);
          result = await this.fromHimalayas(keyword, 0, code, false);
          result.loose = true;
        }
        this.active = 'himalayas';
        this.source.set(JOBS_SOURCE);
      } catch (first) {
        // Himalayas unreachable (no internet, or blocked in a browser): use the backup source.
        try {
          result = await this.fromBackup(keyword, 0, where);
          this.active = 'backup';
          this.source.set(BACKUP_SOURCE);
        } catch {
          throw first;
        }
      }
    }
    result.place = place;
    result.jobs.forEach((j) => this.cache.set(j.id, j));
    this.persist();
    return result;
  }

  /** Searches that had to include "open to anyone" jobs because the country alone gave nothing. */
  private loose = new Set<string>();

  /** Which source answered last (shown in the credit line). */
  readonly source = signal(JOBS_SOURCE);
  private active: 'himalayas' | 'backup' = 'himalayas';

  private async fromHimalayas(search: string, page: number, country?: string, onlyCountry = false): Promise<JobPage> {
    const q = search.trim();
    let res: HimalayasResponse;
    if (q || country) {
      let params = new HttpParams().set('q', q).set('page', page + 1);
      if (country) {
        params = params.set('country', country);
        if (onlyCountry) {
          params = params.set('exclude_worldwide', 'true');
        }
      }
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
  private async fromBackup(search: string, page: number, place?: Place): Promise<JobPage> {
    const pool = await this.backupJobs(search, place);
    const words = search
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 1);
    // a place was named: keep jobs for that place and jobs open to anyone, never jobs tied to another country
    const here = (j: Job) => !!place && locationMentions(j.candidate_required_location, place);
    let list = place ? pool.filter((j) => here(j) || isWorldwide(j.candidate_required_location)) : pool;
    // no place named: jobs open to anyone come first, region-bound ones stay in the list below them
    const localFirst = (j: Job) => (here(j) ? 4 : 0) + (!place && isWorldwide(j.candidate_required_location) ? 2 : 0);
    if (words.length) {
      const scored = list
        .map((job) => {
          const title = job.title.toLowerCase();
          const text = `${title} ${job.company_name} ${job.tags.join(' ')} ${job.category} ${plainText(job.description, 400)}`.toLowerCase();
          const hits = words.filter((w) => text.includes(w)).length;
          const inTitle = words.filter((w) => title.includes(w)).length;
          const phrase = words.length > 1 && title.includes(words.join(' ')) ? 5 : 0;
          return { job, all: hits === words.length, score: hits + inTitle * 2 + phrase + localFirst(job) };
        })
        .filter((x) => x.score > 0);
      // every search word must appear somewhere ("graphic designer" is not "task designer"); loosen only when nothing does
      const strict = scored.filter((x) => x.all);
      list = (strict.length ? strict : scored).sort((a, b) => b.score - a.score).map((x) => x.job);
    } else {
      list = [...list].sort((a, b) => localFirst(b) - localFirst(a));
    }
    const jobs = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    // none of them is only for the named place: they are remote jobs open to anyone
    return { jobs, total: list.length, hasMore: (page + 1) * PAGE_SIZE < list.length, ...(place && !list.some(here) ? { loose: true } : {}) };
  }

  private backupCache = new Map<string, { at: number; jobs: Job[] }>();

  /** Jobs from every backup source for this search, merged and without repeats (kept for a minute so paging is instant). */
  private async backupJobs(search: string, place?: Place): Promise<Job[]> {
    const key = `${search.toLowerCase().trim()}|${place?.code ?? ''}`;
    const hit = this.backupCache.get(key);
    if (hit && Date.now() - hit.at < 60000) {
      return hit.jobs;
    }
    const [pool, remotive, jobicy] = await Promise.all([
      this.loadPool().catch(() => [] as Job[]),
      this.fromRemotive(search).catch(() => [] as Job[]),
      this.fromJobicy(search, place).catch(() => [] as Job[]),
    ]);
    const seen = new Set<string>();
    const jobs: Job[] = [];
    for (const j of [...remotive, ...jobicy, ...pool]) {
      const k = `${j.title}|${j.company_name}`.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        jobs.push(j);
      }
    }
    if (!jobs.length) {
      throw new Error('Backup jobs unavailable');
    }
    this.backupCache.set(key, { at: Date.now(), jobs });
    return jobs;
  }

  /** Remotive: real keyword search over remote jobs in every field, with company logos. */
  private async fromRemotive(search: string): Promise<Job[]> {
    let params = new HttpParams().set('limit', 100);
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    const res = await firstValueFrom(this.http.get<{ jobs?: RemotiveJob[] }>('https://remotive.com/api/remote-jobs', { params }));
    return (res?.jobs ?? []).map(toJobFromRemotive);
  }

  /** Jobicy: remote jobs with a country filter and company logos. */
  private async fromJobicy(search: string, place?: Place): Promise<Job[]> {
    let params = new HttpParams().set('count', 50);
    if (search.trim()) {
      params = params.set('tag', search.trim().split(/\s+/).slice(0, 2).join(' '));
    }
    if (place) {
      params = params.set('geo', place.label.toLowerCase().replace(/\s+/g, '-'));
    }
    const res = await firstValueFrom(this.http.get<{ jobs?: JobicyJob[] }>('https://jobicy.com/api/v2/remote-jobs', { params }));
    return (res?.jobs ?? []).map(toJobFromJobicy);
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

const list = (v: string[] | string | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);

/** Converts a Remotive job into the app's Job interface. */
export function toJobFromRemotive(r: RemotiveJob): Job {
  return {
    id: hashId('remotive:' + r.id),
    url: r.url,
    title: fixText(r.title),
    company_name: fixText(r.company_name),
    company_logo: r.company_logo ?? '',
    category: r.category || 'Remote',
    tags: (r.tags ?? []).slice(0, 8),
    job_type: (r.job_type ?? '').replace('_', ' '),
    publication_date: r.publication_date ?? '',
    candidate_required_location: r.candidate_required_location || 'Worldwide',
    salary: r.salary ?? '',
    description: fixEncoding(r.description ?? ''),
  };
}

/** Converts a Jobicy job into the app's Job interface. */
export function toJobFromJobicy(j: JobicyJob): Job {
  const money = j.salaryMin && j.salaryMax ? `${j.salaryCurrency ?? 'USD'} ${Math.round(j.salaryMin).toLocaleString()} – ${Math.round(j.salaryMax).toLocaleString()}` : '';
  return {
    id: hashId('jobicy:' + j.id),
    url: j.url,
    title: fixText(j.jobTitle),
    company_name: fixText(j.companyName),
    company_logo: j.companyLogo ?? '',
    category: list(j.jobIndustry)[0] ?? 'Remote',
    tags: [j.jobLevel ?? ''].filter(Boolean),
    job_type: list(j.jobType)[0] ?? '',
    publication_date: j.pubDate ?? '',
    candidate_required_location: j.jobGeo || 'Worldwide',
    salary: money,
    description: fixEncoding(j.jobDescription || j.jobExcerpt || ''),
  };
}

/** Converts a RemoteOK job into the app's Job interface. */
export function toJobFromRemoteOk(r: RemoteOkItem): Job {
  const tags = (r.tags ?? []).filter(Boolean);
  const salary = r.salary_min && r.salary_max ? `USD ${r.salary_min.toLocaleString()} – ${r.salary_max.toLocaleString()} / year` : '';
  return {
    id: hashId('remoteok:' + (r.id ?? r.slug ?? r.position)),
    url: r.apply_url || r.url || 'https://remoteok.com',
    title: fixText(r.position ?? 'Remote job'),
    company_name: fixText(r.company ?? ''),
    company_logo: r.company_logo || r.logo || '',
    category: tags[0] ?? 'Remote',
    tags: tags.slice(1, 8),
    job_type: 'Full Time',
    publication_date: r.date ?? '',
    candidate_required_location: r.location || 'Worldwide',
    salary,
    description: fixEncoding(r.description ?? ''),
  };
}

/** Converts a backup-source (Arbeitnow) job into the app's Job interface. */
export function toJobFromArbeitnow(a: ArbeitnowJob): Job {
  const tags = a.tags ?? [];
  const where = [a.remote ? 'Remote' : '', a.location ?? ''].filter(Boolean).join(' · ');
  return {
    id: hashId(a.slug || a.url),
    url: a.url,
    title: fixText(a.title),
    company_name: fixText(a.company_name),
    company_logo: '',
    category: tags[0] ?? 'Jobs',
    tags: tags.slice(1, 8),
    job_type: (a.job_types ?? [])[0] ?? '',
    publication_date: a.created_at ? new Date(a.created_at * 1000).toISOString() : '',
    candidate_required_location: where || 'See posting',
    salary: '',
    description: fixEncoding(a.description ?? ''),
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
    title: fixText(h.title),
    company_name: fixText(h.companyName),
    company_logo: h.companyLogo ?? '',
    category: categories[0] ?? 'Remote',
    tags: [...new Set([...(h.seniority ?? []), ...categories.slice(1)])].slice(0, 8),
    job_type: h.employmentType ?? '',
    publication_date: h.pubDate ? new Date(Number(h.pubDate) * 1000).toISOString() : '',
    candidate_required_location: location,
    salary: min && max ? `${min} – ${max} / ${h.salaryPeriod ?? 'year'}` : min || max,
    description: fixEncoding(h.description || h.excerpt || ''),
  };
}

/** Turns a failed request into a message the user can understand. */
export function describeHttpError(error: unknown): string {
  const e = error as { status?: number };
  if (e?.status === 0) {
    return 'We cannot reach the job sources right now. Check your internet connection and try again.';
  }
  if (e?.status && e.status >= 500) {
    return 'The jobs server is having problems. Please try again later.';
  }
  if (e?.status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return 'Something went wrong while loading jobs.';
}

const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Repairs text that was decoded twice ("Youâ€™ll" becomes "You’ll", "â" + two control characters becomes a dash). Tags and entities stay as they are. */
export function fixEncoding(input: string): string {
  const t = input ?? '';
  if (!/[ÂÃâð][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(t)) {
    return t;
  }
  const bytes: number[] = [];
  for (const c of t) {
    const code = c.codePointAt(0)!;
    if (code < 256) {
      bytes.push(code);
    } else if (CP1252[code] !== undefined) {
      bytes.push(CP1252[code]);
    } else {
      // a real character outside both tables: decode the damaged stretches only, keep everything else
      return t.replace(/[Â-ô][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,3}/g, (m) => fixEncoding(m));
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return t;
  }
}

/** Plain title or name: repaired and with HTML entities turned into characters. */
export function fixText(input: string): string {
  return fixEncoding(input ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Plain-text preview of a job description (the API returns HTML). */
export function plainText(html: string, max = 160): string {
  const text = fixText(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}


/** The job's location text names this place (its country or the city the user gave). */
export function locationMentions(location: string, place: Place): boolean {
  const t = (location ?? '').toLowerCase();
  return t.includes(place.label.toLowerCase()) || (!!place.city && t.includes(place.city.toLowerCase()));
}

/** The location says anyone can apply from anywhere. */
export function isWorldwide(location: string): boolean {
  const t = (location ?? '').toLowerCase().trim();
  return !t || /worldwide|anywhere|global|everywhere|any location|work from anywhere/.test(t) || t === 'remote';
}
