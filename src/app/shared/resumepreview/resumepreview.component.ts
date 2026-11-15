import { Component, Input } from '@angular/core';

import { ResumeData, ResumeTemplate, SectionKey, sectionOrder } from '../../core/resumedata';

@Component({
  selector: 'app-resume-preview',
  templateUrl: './resumepreview.component.html',
  styleUrls: ['./resumepreview.component.scss'],
  standalone: false,
})
export class ResumePreviewComponent {
  @Input({ required: true }) data!: ResumeData;
  @Input() template: ResumeTemplate = 'modern';
  @Input() accent = '#0369a1';

  get mainOrder(): SectionKey[] {
    return sectionOrder(this.data).filter((k) => ['summary', 'experience', 'education', 'projects'].includes(k));
  }

  get isSide(): boolean {
    return this.template === 'modern' || this.template === 'bold' || this.template === 'creative';
  }

  get fullOrder(): SectionKey[] {
    return sectionOrder(this.data);
  }

  get contact(): string[] {
    const c = this.data.contact;
    return [c.email, c.phone, c.location, ...c.links].filter(Boolean);
  }
}
