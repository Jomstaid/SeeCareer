import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject, signal } from '@angular/core';

import { ResumeData, ResumeTemplate, SectionKey, paperOf, sectionOrder } from '../../core/resumedata';

const a4Width = 680;
const a4Points = 595.28;

@Component({
  selector: 'app-resume-preview',
  templateUrl: './resumepreview.component.html',
  styleUrls: ['./resumepreview.component.scss'],
  standalone: false,
})
export class ResumePreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) data!: ResumeData;
  @Input() template: ResumeTemplate = 'modern';
  @Input() accent = '#0369a1';
  @Input() paper?: string;

  @ViewChild('sheet') sheet?: ElementRef<HTMLElement>;

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private watcher?: ResizeObserver;
  readonly scale = signal(1);
  readonly fitHeight = signal<number | null>(null);

  get paperWidth(): number {
    const p = paperOf(this.paper);
    return Math.round(Math.max(520, (a4Width * p.w) / a4Points));
  }

  get paperHeight(): number {
    const p = paperOf(this.paper);
    return Math.round((this.paperWidth * p.h) / p.w);
  }

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

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.watcher = new ResizeObserver(() => this.fit());
      this.watcher.observe(this.host.nativeElement);
      if (this.sheet) {
        this.watcher.observe(this.sheet.nativeElement);
      }
    }
    this.fit();
  }

  ngOnChanges(): void {
    requestAnimationFrame(() => this.fit());
  }

  ngOnDestroy(): void {
    this.watcher?.disconnect();
  }

  private fit(): void {
    const width = this.host.nativeElement.clientWidth;
    const sheet = this.sheet?.nativeElement;
    if (!width || !sheet) {
      return;
    }
    const scale = Math.min(1, width / this.paperWidth);
    this.scale.set(scale);
    this.fitHeight.set(Math.ceil(sheet.offsetHeight * scale));
  }
}
