import { Component, EventEmitter, Input, Output } from '@angular/core';

import { plainText } from '../../core/job.service';
import { Job } from '../../core/models';

/** One job in the list. Shows the main info and tells the page when it is tapped or bookmarked. */
@Component({
  selector: 'app-job-card',
  templateUrl: './job-card.component.html',
  styleUrls: ['./job-card.component.scss'],
  standalone: false,
})
export class JobCardComponent {
  @Input({ required: true }) job!: Job;
  @Input() saved = false;
  @Output() open = new EventEmitter<Job>();
  @Output() toggleSave = new EventEmitter<Job>();

  logoFailed = false;

  get preview(): string {
    return plainText(this.job.description, 120);
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
