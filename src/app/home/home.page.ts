import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

import { JobService } from '../core/job.service';
import { Job } from '../core/models';
import { SettingsService } from '../core/settings.service';

interface Shortcut {
  image: string;
  darkImage: string;
  title: string;
  text: string;
  path: string;
}

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
    { image: 'assets/icon/navChat.png', darkImage: 'assets/icon/darkNavChat.png', title: 'AI Assistant', text: 'Chat, build a resume, check your match, write cover letters and practice interviews.', path: '/chat' },
    { image: 'assets/icon/navJobs.png', darkImage: 'assets/icon/darkNavJobs.png', title: 'Job board', text: 'Browse and search thousands of remote openings.', path: '/jobs' },
    { image: 'assets/icon/navSettings.png', darkImage: 'assets/icon/darkNavSettings.png', title: 'Settings', text: 'AI providers, theme, text size and your data.', path: '/settings' },
    { image: 'assets/icon/navAbout.png', darkImage: 'assets/icon/darkNavAbout.png', title: 'About our group', text: 'The project, the course and the team behind it.', path: '/about' },
  ];

  latest = signal<Job[]>([]);
  loading = signal(true);
  failed = signal(false);

  ngOnInit(): void {
    this.loadLatest();
  }

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

  toggleSave(job: Job, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.jobService.toggleSaved(job.id);
  }
}
