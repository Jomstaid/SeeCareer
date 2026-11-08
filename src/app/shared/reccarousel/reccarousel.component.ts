import { Component, EventEmitter, Input, Output } from '@angular/core';

import { faviconUrl, logoCandidates } from '../../core/logo';
import { Job, Recommendation } from '../../core/models';

/**
 * Swipeable list of recommended jobs. Each card shows the fit %, the chance label,
 * how many skills match, which are missing, and Apply / Details / Select buttons.
 * On wide screens the cards sit in a grid instead of a sideways scroll.
 */
@Component({
  selector: 'app-rec-carousel',
  templateUrl: './reccarousel.component.html',
  styleUrls: ['./reccarousel.component.scss'],
  standalone: false,
})
export class RecCarouselComponent {
  @Input({ required: true }) recs: Recommendation[] = [];
  /** Id of the job the user already picked. */
  @Input() selectedId?: number;
  @Output() details = new EventEmitter<Job>();
  @Output() select = new EventEmitter<Job>();

  /** The job's own logo failed to load. */
  private failed = new Set<number>();
  /** How many guessed web addresses were tried for a job without a usable logo. */
  private guesses = new Map<number, number>();

  /** The company logo (the job's own, or its website icon); null shows a coloured initial instead. */
  logoUrl(job: Job): string | null {
    if (job.company_logo && !this.failed.has(job.id)) {
      return job.company_logo;
    }
    const pick = logoCandidates(job.company_name, job.description)[this.guesses.get(job.id) ?? 0];
    return pick ? faviconUrl(pick.domain) : null;
  }

  logoBad(job: Job): void {
    if (job.company_logo && !this.failed.has(job.id)) {
      this.failed.add(job.id);
    } else {
      this.guesses.set(job.id, (this.guesses.get(job.id) ?? 0) + 1);
    }
  }

  onLogoLoad(event: Event, job: Job): void {
    if (job.company_logo && !this.failed.has(job.id)) {
      return;
    }
    const img = event.target as HTMLImageElement;
    const sure = logoCandidates(job.company_name, job.description)[this.guesses.get(job.id) ?? 0]?.sure;
    if (img.naturalWidth < (sure ? 32 : 100)) {
      this.logoBad(job);
    }
  }

  initial(job: Job): string {
    return (job.company_name || '?').charAt(0).toUpperCase();
  }

  /** A colour that is always the same for the same company. */
  avatar(job: Job): string {
    let h = 0;
    for (const c of job.company_name || job.title) {
      h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return `linear-gradient(135deg, hsl(${h} 62% 38%), hsl(${(h + 40) % 360} 62% 30%))`;
  }

  tone(score: number): 'good' | 'mid' | 'low' {
    return score >= 75 ? 'good' : score >= 55 ? 'mid' : 'low';
  }

  skillPct(r: Recommendation): number {
    const total = r.matched.length + r.missing.length;
    return total ? Math.round((r.matched.length / total) * 100) : r.score;
  }
}
