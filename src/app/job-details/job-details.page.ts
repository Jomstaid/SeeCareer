import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { JOB_TASKS, TaskKey } from '../core/ai-tasks';
import { JobService, describeHttpError } from '../core/job.service';
import { Job } from '../core/models';
import { ResumeService } from '../core/resume.service';

/** Details page: shows one job. The id comes from the route /job/:id. */
@Component({
  selector: 'app-job-details',
  templateUrl: './job-details.page.html',
  styleUrls: ['./job-details.page.scss'],
  standalone: false,
})
export class JobDetailsPage implements OnInit {
  job = signal<Job | undefined>(undefined);
  loading = signal(true);
  error = signal('');
  logoFailed = false;

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
