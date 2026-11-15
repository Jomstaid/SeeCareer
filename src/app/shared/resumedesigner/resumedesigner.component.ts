import { Component, EventEmitter, Input, OnChanges, Output, signal, inject } from '@angular/core';

import { AiError } from '../../core/models';
import { deliverBlob, safeFileName } from '../../core/fileexport';
import { ACCENTS, PAPERS, ResumeData, ResumeTemplate, TEMPLATES, customPaper, detectPaper, paperOf, resumeToText } from '../../core/resumedata';
import { buildResumeFile } from '../../core/resumerender';
import { ResumeDesignService } from '../../core/resumedesign.service';
import { squarePhotoFromFile } from '../../core/photo';
import { readJson, writeJson } from '../../core/storage';

const prefKey = 'seecareer.resumeDesign';

@Component({
  selector: 'app-resume-designer',
  templateUrl: './resumedesigner.component.html',
  styleUrls: ['./resumedesigner.component.scss'],
  standalone: false,
})
export class ResumeDesignerComponent implements OnChanges {
  private designService = inject(ResumeDesignService);

  @Input() open = false;
  @Input() data: ResumeData | null = null;
  @Input() design: { template: ResumeTemplate; accent: string } | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() designChanged = new EventEmitter<{ template: ResumeTemplate; accent: string }>();
  @Output() changed = new EventEmitter<ResumeData>();
  @Output() saveText = new EventEmitter<string>();

  readonly templates = TEMPLATES;
  readonly accents = ACCENTS;
  readonly papers = PAPERS;
  customOpen = signal(false);
  customW = 8.5;
  customH = 13;
  customUnit: 'in' | 'mm' = 'in';
  readonly ideas = ['Make it fit one page', 'Use legal paper', 'Shorter summary', 'Stronger action verbs', 'Emphasize teamwork', 'Make it more senior'];

  template = signal<ResumeTemplate>(readJson<{ t?: ResumeTemplate }>(prefKey, {}).t ?? 'modern');
  accent = signal<string>(readJson<{ a?: string }>(prefKey, {}).a ?? ACCENTS[0].hex);
  busy = signal(false);
  working = signal<'pdf' | 'docx' | ''>('');
  message = signal('');
  messageIsError = signal(false);
  instruction = '';

  ngOnChanges(): void {
    if (this.open && this.design) {
      this.template.set(this.design.template);
      this.accent.set(this.design.accent);
    }
  }

  hint(): string {
    const t = TEMPLATES.find((x) => x.key === this.template());
    return t ? `${t.blurb}. Suits ${t.fits}.` : '';
  }

  setTemplate(value: string | number | null | undefined): void {
    const t = String(value) as ResumeTemplate;
    if (TEMPLATES.some((x) => x.key === t)) {
      this.template.set(t);
      this.remember();
    }
  }

  setAccent(hex: string): void {
    this.accent.set(hex);
    this.remember();
  }

  private remember(): void {
    writeJson(prefKey, { t: this.template(), a: this.accent() });
    this.designChanged.emit({ template: this.template(), accent: this.accent() });
  }

  async pickPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.data) {
      return;
    }
    try {
      this.changed.emit({ ...this.data, photo: await squarePhotoFromFile(file) });
      this.say('Photo added.', false);
    } catch {
      this.say('That file is not a picture I can use. Try a JPG or PNG.', true);
    }
  }

  removePhoto(): void {
    if (this.data) {
      const { photo, ...rest } = this.data;
      this.changed.emit(rest);
      this.say('Photo removed.', false);
    }
  }

  paperKey(): string {
    return paperOf(this.data?.design?.paper).key;
  }

  paperLabel(): string {
    return paperOf(this.data?.design?.paper).label;
  }

  isCustomPaper(): boolean {
    return this.paperKey().startsWith('custom-');
  }

  setPaper(value: string | number | null | undefined): void {
    const key = String(value ?? '');
    if (key === 'custom') {
      const now = paperOf(this.data?.design?.paper);
      const toUnit = (pt: number) => (this.customUnit === 'mm' ? Math.round((pt / 72) * 25.4) : Math.round((pt / 72) * 100) / 100);
      this.customW = toUnit(now.w);
      this.customH = toUnit(now.h);
      this.customOpen.set(true);
      return;
    }
    this.customOpen.set(false);
    this.applyPaper(paperOf(key).key);
  }

  applyCustom(): void {
    const factor = this.customUnit === 'mm' ? 72 / 25.4 : 72;
    const w = Number(this.customW);
    const h = Number(this.customH);
    const key = customPaper(w * factor, h * factor);
    if (!key || !(w > 0 && h > 0)) {
      this.say('Type a width and a height, for example 8.5 and 13 inches.', true);
      return;
    }
    this.customOpen.set(false);
    this.applyPaper(key);
  }

  private applyPaper(key: string): void {
    if (!this.data || paperOf(this.data.design?.paper).key === key) {
      return;
    }
    this.changed.emit({ ...this.data, design: { ...this.data.design, paper: key } });
    this.say(`Paper size: ${paperOf(key).label}.`, false);
  }

  useIdea(text: string): void {
    this.instruction = text;
  }

  async applyChange(): Promise<void> {
    const text = this.instruction.trim();
    if (!this.data || this.busy()) {
      return;
    }
    if (text.length < 4) {
      this.say('Tell me what to change, for example "make it fit one page".', true);
      return;
    }
    const paper = detectPaper(text);
    if (paper && text.length <= 60 && !/(and|also|then|plus)/i.test(text)) {
      this.applyPaper(paper);
      this.say(`Done. The paper size is now ${paperOf(paper).label}.`, false);
      this.instruction = '';
      return;
    }
    this.busy.set(true);
    this.say('', false);
    try {
      const out = await this.designService.refine(this.data, text);
      this.changed.emit(out.data);
      this.instruction = '';
      this.say('Done. The preview is updated.', false);
    } catch (e) {
      this.say(e instanceof AiError ? e.message : 'The AI could not change the resume. Try again or word it differently.', true);
    } finally {
      this.busy.set(false);
    }
  }

  async download(format: 'pdf' | 'docx'): Promise<void> {
    if (!this.data || this.working()) {
      return;
    }
    this.working.set(format);
    try {
      const blob = await buildResumeFile(format, this.data, this.template(), this.accent());
      const result = await deliverBlob(blob, `${safeFileName(this.data.name)} Resume.${format}`);
      this.say(result, false);
    } catch {
      this.say('Could not create the file. Please try again.', true);
    } finally {
      this.working.set('');
    }
  }

  saveAsMine(): void {
    if (this.data) {
      this.saveText.emit(resumeToText(this.data));
      this.say('Saved as your resume on this device.', false);
    }
  }

  private say(text: string, error: boolean): void {
    this.message.set(text);
    this.messageIsError.set(error);
  }
}
