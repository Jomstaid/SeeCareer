import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { JOB_TASKS, TaskKey } from '../core/aitasks';
import { JobService, describeHttpError, fixEncoding } from '../core/job.service';
import { domainGuesses, faviconUrl } from '../core/logo';
import { Job } from '../core/models';
import { ResumeService } from '../core/resume.service';

/** Details page: shows one job. The id comes from the route /job/:id. */
@Component({
  selector: 'app-job-details',
  templateUrl: './jobdetails.page.html',
  styleUrls: ['./jobdetails.page.scss'],
  standalone: false,
})
export class JobDetailsPage implements OnInit {
  job = signal<Job | undefined>(undefined);
  loading = signal(true);
  error = signal('');
  logoFailed = false;

  /** Jobs saved on the device before the repair still have broken characters in them. */
  clean(html: string): string {
    return fixEncoding(html);
  }
  private guess = 0;

  /** The job's logo, or the company's website icon when the job has none; null shows the initial. */
  logoFor(j: Job): string | null {
    if (j.company_logo && !this.logoFailed) {
      return j.company_logo;
    }
    const domain = domainGuesses(j.company_name)[this.guess];
    return domain ? faviconUrl(domain) : null;
  }

  logoBad(j: Job): void {
    if (j.company_logo && !this.logoFailed) {
      this.logoFailed = true;
    } else {
      this.guess++;
    }
  }

  logoLoaded(event: Event, j: Job): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth < 120 && !(j.company_logo && !this.logoFailed)) {
      this.logoBad(j);
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public jobService: JobService,
    public resume: ResumeService,
  ) {}

  /** The AI buttons shown on this page. */
  readonly tasks = JOB_TASKS;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('This job link is not valid.');
      this.loading.set(false);
      return;
    }
    this.load(id);
  }

  async load(id: number): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const found = await this.jobService.getJob(id);
      if (found) {
        this.job.set(found);
      } else {
        this.error.set('This job is no longer listed.');
      }
    } catch (e) {
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  retry(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  /** Opens the AI chat with this job selected (and optionally runs a task). */
  askAi(task?: TaskKey): void {
    const job = this.job();
    if (job) {
      this.router.navigate(['/tabs/chat'], { queryParams: { jobId: job.id, ...(task ? { task } : {}) } });
    }
  }

  get postedDate(): string {
    const date = new Date(this.job()?.publication_date ?? '');
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
