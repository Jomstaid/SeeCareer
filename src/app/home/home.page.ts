import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';

import { JobService } from '../core/job.service';
import { Job } from '../core/models';

/** One shortcut card on the Home page. */
interface Shortcut {
  icon: string;
  title: string;
  text: string;
  path: string;
}

/** Home page: a welcome, shortcuts to every part of the app, and a few fresh jobs from the public API. */
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  readonly shortcuts: Shortcut[] = [
    { icon: 'sparkles-outline', title: 'AI Assistant', text: 'Chat, build a resume, check your match, write cover letters and practice interviews.', path: '/chat' },
    { icon: 'briefcase-outline', title: 'Job board', text: 'Browse and search thousands of remote openings.', path: '/jobs' },
    { icon: 'options-outline', title: 'Settings', text: 'AI providers, theme, text size and your data.', path: '/settings' },
    { icon: 'people-outline', title: 'About our group', text: 'The project, the course and the team behind it.', path: '/about' },
  ];

  latest = signal<Job[]>([]);
  loading = signal(true);
  failed = signal(false);

  constructor(
    public jobService: JobService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadLatest();
  }

  /** Fetches the newest jobs with HttpClient GET (through the job service). */
  async loadLatest(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const result = await this.jobService.getJobs('', 0);
      this.latest.set(result.jobs.slice(0, 6));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  go(path: string): void {
    this.router.navigateByUrl(path);
  }

  openJob(job: Job): void {
    this.router.navigate(['/job', job.id]);
  }
}
