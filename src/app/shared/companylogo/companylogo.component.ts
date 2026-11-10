import { Component, Input } from '@angular/core';

import { faviconUrl, logoCandidates } from '../../core/logo';
import { Job } from '../../core/models';

/** A company's logo (the job's own, or its website icon), or a coloured initial when none can be found. */
@Component({
  selector: 'app-company-logo',
  templateUrl: './companylogo.component.html',
  styleUrls: ['./companylogo.component.scss'],
  standalone: false,
})
export class CompanyLogoComponent {
  @Input({ required: true }) job!: Job;
  /** Side of the square, in pixels. */
  @Input() size = 48;

  private failed = false;
  /** How many guessed web addresses were tried without a usable logo. */
  private guess = 0;

  get url(): string | null {
    if (this.job.company_logo && !this.failed) {
      return this.job.company_logo;
    }
    const pick = logoCandidates(this.job.company_name, this.job.description)[this.guess];
    return pick ? faviconUrl(pick.domain) : null;
  }

  bad(): void {
    if (this.job.company_logo && !this.failed) {
      this.failed = true;
    } else {
      this.guess++;
    }
  }

  loaded(event: Event): void {
    if (this.job.company_logo && !this.failed) {
      return;
    }
    // a small icon is the default globe or a poor match; a website named in the job text is trusted with a smaller one
    const sure = logoCandidates(this.job.company_name, this.job.description)[this.guess]?.sure;
    if ((event.target as HTMLImageElement).naturalWidth < (sure ? 32 : 100)) {
      this.bad();
    }
  }

  get initial(): string {
    return (this.job.company_name || '?').charAt(0).toUpperCase();
  }

  /** A colour that is always the same for the same company. */
  get avatar(): string {
    let h = 0;
    for (const c of this.job.company_name || this.job.title) {
      h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return `linear-gradient(135deg, hsl(${h} 62% 38%), hsl(${(h + 40) % 360} 62% 30%))`;
  }
}
