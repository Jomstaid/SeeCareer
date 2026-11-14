import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

import { JobService } from '../core/job.service';
import { Job } from '../core/models';
import { SettingsService } from '../core/settings.service';

/** One shortcut card on the Home page. */
interface Shortcut {
  image: string;
  darkImage: string;
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
  jobService = inject(JobService);
  settings = inject(SettingsService);
  private router = inject(Router);

  readonly shortcuts: Shortcut[] = [
    { image: 'assets/icon/nav-chat.png', darkImage: 'assets/icon/dark-nav-chat.png', title: 'AI Assistant', text: 'Chat, build a resume, check your match, write cover letters and practice interviews.', path: '/chat' },
    { image: 'assets/icon/nav-jobs.png', darkImage: 'assets/icon/dark-nav-jobs.png', title: 'Job board', text: 'Browse and search thousands of remote openings.', path: '/jobs' },
    { image: 'assets/icon/nav-settings.png', darkImage: 'assets/icon/dark-nav-settings.png', title: 'Settings', text: 'AI providers, theme, text size and your data.', path: '/settings' },
    { image: 'assets/icon/nav-about.png', darkImage: 'assets/icon/dark-nav-about.png', title: 'About our group', text: 'The project, the course and the team behind it.', path: '/about' },
  ];

  latest = signal<Job[]>([]);
  loading = signal(true);
  failed = signal(false);

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
