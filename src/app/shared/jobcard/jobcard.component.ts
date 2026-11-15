import { Component, EventEmitter, Input, Output } from '@angular/core';

import { plainText } from '../../core/job.service';
import { faviconUrl, logoCandidates } from '../../core/logo';
import { Job } from '../../core/models';

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
  private guess = 0;

  get logoUrl(): string | null {
    if (this.job.company_logo && !this.logoFailed) {
      return this.job.company_logo;
    }
    const pick = logoCandidates(this.job.company_name, this.job.description)[this.guess];
    return pick ? faviconUrl(pick.domain) : null;
  }

  logoBad(): void {
    if (this.job.company_logo && !this.logoFailed) {
      this.logoFailed = true;
    } else {
      this.guess++;
    }
  }

  onLogoLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (this.job.company_logo && !this.logoFailed) {
      return;
    }
    const sure = logoCandidates(this.job.company_name, this.job.description)[this.guess]?.sure;
    if (img.naturalWidth < (sure ? 32 : 100)) {
      this.logoBad();
    }
  }

  get preview(): string {
    return plainText(this.job.description, 120);
  }

  get avatar(): string {
    let h = 0;
    for (const c of this.job.company_name || this.job.title) {
      h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return `hsl(${h} 58% 42%)`;
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
