import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';

import { AiError } from '../../core/models';
import { deliverBlob, safeFileName } from '../../core/fileexport';
import { ACCENTS, ResumeData, ResumeTemplate, TEMPLATES, resumeToText } from '../../core/resumedata';
import { buildResumeFile } from '../../core/resumerender';
import { ResumeDesignService } from '../../core/resumedesign.service';
import { squarePhotoFromFile } from '../../core/photo';
import { readJson, writeJson } from '../../core/storage';

const PREF_KEY = 'seecareer.resumeDesign';

/** Pick a layout and colour, preview the resume, ask the AI for changes, and download it as PDF or Word. */
@Component({
  selector: 'app-resume-designer',
  templateUrl: './resumedesigner.component.html',
  styleUrls: ['./resumedesigner.component.scss'],
  standalone: false,
})
export class ResumeDesignerComponent implements OnChanges {
  @Input() open = false;
  @Input() data: ResumeData | null = null;
  /** The layout and colour to start with (for example the ones the resume was already made in). */
  @Input() design: { template: ResumeTemplate; accent: string } | null = null;
  @Output() closed = new EventEmitter<void>();
  /** The user picked another layout or colour. */
  @Output() designChanged = new EventEmitter<{ template: ResumeTemplate; accent: string }>();
  /** The resume changed (the AI applied a request). */
  @Output() changed = new EventEmitter<ResumeData>();
  /** The user wants this resume saved as "my resume" (plain text). */
  @Output() saveText = new EventEmitter<string>();

  readonly templates = TEMPLATES;
  readonly accents = ACCENTS;
  readonly ideas = ['Make it fit one page', 'Shorter summary', 'Stronger action verbs', 'Emphasize teamwork', 'Make it more senior'];

  template = signal<ResumeTemplate>(readJson<{ t?: ResumeTemplate }>(PREF_KEY, {}).t ?? 'modern');
  accent = signal<string>(readJson<{ a?: string }>(PREF_KEY, {}).a ?? ACCENTS[0].hex);
  busy = signal(false);
  working = signal<'pdf' | 'docx' | ''>('');
  message = signal('');
  messageIsError = signal(false);
  instruction = '';

  constructor(private designService: ResumeDesignService) {}

  ngOnChanges(): void {
    if (this.open && this.design) {
      this.template.set(this.design.template);
      this.accent.set(this.design.accent);
    }
  }

  /** One line about the chosen design: what it looks like and who it suits. */
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
    writeJson(PREF_KEY, { t: this.template(), a: this.accent() });
    this.designChanged.emit({ template: this.template(), accent: this.accent() });
  }

  /** Adds or replaces the profile photo with a picture the user chose. */
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

  useIdea(text: string): void {
    this.instruction = text;
  }

  /** Asks the AI to change the resume as the user described. */
  async applyChange(): Promise<void> {
    const text = this.instruction.trim();
    if (!this.data || this.busy()) {
      return;
    }
    if (text.length < 4) {
      this.say('Tell me what to change, for example "make it fit one page".', true);
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
