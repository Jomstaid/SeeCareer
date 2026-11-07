import { Component, Input } from '@angular/core';

import { ResumeData, ResumeTemplate, SectionKey, sectionOrder } from '../../core/resumedata';

/** On-screen preview of the resume in the chosen design. Mirrors the PDF and Word layouts. */
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

  /** Sections in the order the design uses; the modern side column keeps skills, languages and certifications. */
  get mainOrder(): SectionKey[] {
    return sectionOrder(this.data).filter((k) => ['summary', 'experience', 'education', 'projects'].includes(k));
  }

  /** The designs with a side column (the others are one column). */
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
