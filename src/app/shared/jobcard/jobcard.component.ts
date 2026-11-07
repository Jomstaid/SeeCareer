import { Component, EventEmitter, Input, Output } from '@angular/core';

import { plainText } from '../../core/job.service';
import { domainGuesses, faviconUrl } from '../../core/logo';
import { Job } from '../../core/models';

/** One job in the list. Shows the main info and tells the page when it is tapped or bookmarked. */
@Component({
  selector: 'app-job-card',
  templateUrl: './jobcard.component.html',
  styleUrls: ['./jobcard.component.scss'],
  standalone: false,
})
export class JobCardComponent {
  @Input({ required: true }) job!: Job;
  @Input() saved = false;
  @Output() open = new EventEmitter<Job>();
  @Output() toggleSave = new EventEmitter<Job>();

  logoFailed = false;
  /** How many guessed web addresses were tried without a usable logo. */
  private guess = 0;

  /** The real logo from the job, or the company's website icon; null when there is none (a coloured initial is shown). */
  get logoUrl(): string | null {
    if (this.job.company_logo && !this.logoFailed) {
      return this.job.company_logo;
    }
    const domain = domainGuesses(this.job.company_name)[this.guess];
    return domain ? faviconUrl(domain) : null;
  }

  /** The picture did not load, or it is only the default globe: try the next address. */
  logoBad(): void {
    if (this.job.company_logo && !this.logoFailed) {
      this.logoFailed = true;
    } else {
      this.guess++;
    }
  }

  onLogoLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth < 120 && !(this.job.company_logo && !this.logoFailed)) {
      this.logoBad(); // a small icon is the default globe or a poor match, not a logo
    }
  }

  get preview(): string {
    return plainText(this.job.description, 120);
  }

  /** A colour that is always the same for the same company, so cards without a logo still look distinct. */
  get avatar(): string {
    let h = 0;
    for (const c of this.job.company_name || this.job.title) {
      h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return `linear-gradient(135deg, hsl(${h} 62% 38%), hsl(${(h + 40) % 360} 62% 30%))`;
  }

  get initial(): string {
    return (this.job.company_name || '?').charAt(0).toUpperCase();
  }

  onOpen(): void {
    this.open.emit(this.job);
  }

  onSave(event: Event): void {
    event.stopPropagation();
    this.toggleSave.emit(this.job);
  }
}
