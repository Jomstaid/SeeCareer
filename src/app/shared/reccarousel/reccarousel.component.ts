import { Component, EventEmitter, Input, Output } from '@angular/core';

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
  @Output() jobSelected = new EventEmitter<Job>();

  tone(score: number): 'good' | 'mid' | 'low' {
    return score >= 75 ? 'good' : score >= 55 ? 'mid' : 'low';
  }

  skillPct(r: Recommendation): number {
    const total = r.matched.length + r.missing.length;
    return total ? Math.round((r.matched.length / total) * 100) : r.score;
  }
}
