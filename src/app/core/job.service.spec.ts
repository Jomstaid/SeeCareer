import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { JobService, hashId, plainText, toJob } from './job.service';
import { HimalayasJob } from './models';

const raw: HimalayasJob = {
  title: 'Junior Developer',
  companyName: 'Acme',
  employmentType: 'Full Time',
  minSalary: 30000,
  maxSalary: 40000,
  currency: 'USD',
  salaryPeriod: 'annual',
  locationRestrictions: ['Philippines'],
  categories: ['Web-Developer'],
  parentCategories: ['Software-Development'],
  description: '<p>Hello</p>',
  pubDate: 1793768570,
  applicationLink: 'https://himalayas.app/companies/acme/jobs/junior-developer',
  guid: 'https://himalayas.app/companies/acme/jobs/junior-developer',
};

describe('JobService', () => {
  let service: JobService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(JobService);
    http = TestBed.inject(HttpTestingController);
  });

  it('browses the feed with an HTTP GET (limit + offset) and caches the jobs', async () => {
    const promise = service.getJobs('', 2);
    const req = http.expectOne((r) => r.url.endsWith('/jobs/api'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('offset')).toBe('40');
    req.flush({ totalCount: 114000, jobs: [raw] });
    const page = await promise;
    expect(page.total).toBe(114000);
    expect(page.hasMore).toBe(true);
    expect(service.peek(page.jobs[0].id)?.title).toBe('Junior Developer');
  });

  it('searches with a keyword and page number', async () => {
    const promise = service.getJobs('python', 0);
    const req = http.expectOne((r) => r.url.endsWith('/jobs/api/search'));
    expect(req.request.params.get('q')).toBe('python');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ totalCount: 1, jobs: [raw] });
    expect((await promise).hasMore).toBe(false);
  });

  it('toggles bookmarks', () => {
    service.toggleSaved(7);
    expect(service.isSaved(7)).toBe(true);
    service.toggleSaved(7);
    expect(service.isSaved(7)).toBe(false);
  });
});

describe('toJob / helpers', () => {
  it('converts the API job into the app shape', () => {
    const job = toJob(raw);
    expect(job.category).toBe('Software Development');
    expect(job.salary).toContain('30,000');
    expect(job.candidate_required_location).toBe('Philippines');
    expect(job.id).toBe(hashId(raw.guid));
  });

  it('strips HTML and shortens long text', () => {
    expect(plainText('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(plainText('a'.repeat(300), 10).length).toBe(11);
  });
});

describe('fixText', () => {
  it('repairs text that was decoded twice and decodes entities', async () => {
    const { fixText } = await import('./job.service');
    expect(fixText('weâ\u0080\u0099re hiring')).toBe('we’re hiring');
    expect(fixText('Entry Level Scheduling &amp; Coordinating')).toBe('Entry Level Scheduling & Coordinating');
    expect(fixText('Plain title')).toBe('Plain title');
    expect(fixText('Café manager')).toBe('Café manager');
  });
});

describe('fixEncoding', () => {
  it('repairs the Windows-1252 kind of damage and leaves tags alone', async () => {
    const { fixEncoding } = await import('./job.service');
    expect(fixEncoding('<p>You\u00e2\u20ac\u2122ll work with us \u00e2\u20ac\u201c remote</p>')).toBe('<p>You\u2019ll work with us \u2013 remote</p>');
    expect(fixEncoding('<p>Fine &amp; clean</p>')).toBe('<p>Fine &amp; clean</p>');
    expect(fixEncoding('Caf\u00e9 \u2019 ok')).toBe('Caf\u00e9 \u2019 ok');
  });
});

describe('jobs for a named place', () => {
  it('matches the country or city in the location and knows worldwide jobs', async () => {
    const { locationMentions, isWorldwide } = await import('./job.service');
    const ph = { label: 'Philippines', code: 'PH', city: 'Nueva Ecija' };
    expect(locationMentions('Philippines, Indonesia', ph)).toBe(true);
    expect(locationMentions('Cabanatuan, Nueva Ecija', ph)).toBe(true);
    expect(locationMentions('Texas,', ph)).toBe(false);
    expect(locationMentions('Hamburg, Hamburg, Deutschland', ph)).toBe(false);
    expect(locationMentions('Anywhere in the World', { label: 'India', code: 'IN' })).toBe(false); // "in" is not India
    expect(isWorldwide('Anywhere in the World')).toBe(true);
    expect(isWorldwide('Worldwide')).toBe(true);
    expect(isWorldwide('Texas,')).toBe(false);
  });
});
