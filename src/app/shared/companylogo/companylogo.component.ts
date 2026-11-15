import { Component, Input } from '@angular/core';

import { faviconUrl, logoCandidates } from '../../core/logo';
import { Job } from '../../core/models';

@Component({
  selector: 'app-company-logo',
  templateUrl: './companylogo.component.html',
  styleUrls: ['./companylogo.component.scss'],
  standalone: false,
})
export class CompanyLogoComponent {
  @Input({ required: true }) job!: Job;
  @Input() size = 48;

  private failed = false;
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
    const sure = logoCandidates(this.job.company_name, this.job.description)[this.guess]?.sure;
    if ((event.target as HTMLImageElement).naturalWidth < (sure ? 32 : 100)) {
      this.bad();
    }
  }

  get initial(): string {
    return (this.job.company_name || '?').charAt(0).toUpperCase();
  }

  get avatar(): string {
    let h = 0;
    for (const c of this.job.company_name || this.job.title) {
      h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return `hsl(${h} 58% 42%)`;
  }
}
