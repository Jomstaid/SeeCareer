import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Job, Recommendation } from '../../core/models';

@Component({
  selector: 'app-rec-carousel',
  templateUrl: './reccarousel.component.html',
  styleUrls: ['./reccarousel.component.scss'],
  standalone: false,
})
export class RecCarouselComponent {
  @Input({ required: true }) recs: Recommendation[] = [];
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
