import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

import { JobService, QUICK_FILTERS, describeHttpError } from '../core/job.service';
import { Job } from '../core/models';
import { SettingsService } from '../core/settings.service';

/** Jobs page: 100k+ jobs from the public API, 20 at a time, with search, filters, bookmarks and infinite scroll. */
@Component({
  selector: 'app-jobs',
  templateUrl: './jobs.page.html',
  styleUrls: ['./jobs.page.scss'],
  standalone: false,
})
export class JobsPage implements OnInit {
  jobService = inject(JobService);
  settings = inject(SettingsService);
  private router = inject(Router);

  readonly filters = QUICK_FILTERS;

  jobs = signal<Job[]>([]);
  total = signal(0);
  hasMore = signal(false);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal('');

  // two-way bound inputs
  searchText = '';
  filter = '';
  savedOnly = false;
  private savedFlag = signal(false);

  private page = 0;
  private request = 0;
  private timer?: ReturnType<typeof setTimeout>;

  visibleJobs = computed(() => (this.savedFlag() ? this.jobService.savedJobs() : this.jobs()));

  ngOnInit(): void {
    this.loadJobs();
  }

  /** The keyword actually searched: the search box wins over the quick filter. */
  private get query(): string {
    return this.searchText.trim() || this.filter;
  }

  onSearchInput(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loadJobs(), 600);
  }

  onFilterChange(): void {
    this.searchText = '';
    this.loadJobs();
  }

  onSavedToggle(): void {
    this.savedFlag.set(this.savedOnly);
  }

  clearFilters(): void {
    this.searchText = '';
    this.filter = '';
    this.savedOnly = false;
    this.savedFlag.set(false);
    this.loadJobs();
  }

  /** Loads the first page again (new search, filter or pull-to-refresh). */
  async loadJobs(): Promise<void> {
    const ticket = ++this.request;
    this.page = 0;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.jobService.getJobs(this.query, 0);
      if (ticket !== this.request) {
        return; // an older search finished after a newer one started
      }
      this.jobs.set(result.jobs);
      this.total.set(result.total);
      this.hasMore.set(result.hasMore);
    } catch (e) {
      if (ticket === this.request) {
        this.jobs.set([]);
        this.total.set(0);
        this.hasMore.set(false);
        this.error.set(describeHttpError(e));
      }
    } finally {
      if (ticket === this.request) {
        this.loading.set(false);
      }
    }
  }

  /** Infinite scroll: adds the next 20 jobs. */
  async loadMore(event: CustomEvent): Promise<void> {
    const target = event.target as HTMLIonInfiniteScrollElement;
    if (!this.hasMore() || this.loadingMore() || this.savedFlag()) {
      target.complete();
      return;
    }
    this.loadingMore.set(true);
    try {
      const result = await this.jobService.getJobs(this.query, this.page + 1);
      this.page++;
      const seen = new Set(this.jobs().map((j) => j.id));
      this.jobs.set([...this.jobs(), ...result.jobs.filter((j) => !seen.has(j.id))]);
      this.hasMore.set(result.hasMore);
    } catch {
      this.hasMore.set(true); // keep the scroller; the next scroll tries again
    } finally {
      this.loadingMore.set(false);
      target.complete();
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.loadJobs();
    (event.target as HTMLIonRefresherElement).complete();
  }

  openJob(job: Job): void {
    this.router.navigate(['/job', job.id]);
  }

  trackJob(_: number, job: Job): number {
    return job.id;
  }
}
