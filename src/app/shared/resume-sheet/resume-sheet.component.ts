import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';

import { FileReadError, kindOf, readAttachment } from '../../core/file-reader';
import { ResumeService } from '../../core/resume.service';
import { MAX_RESUME_LENGTH, validateResume } from '../../core/validators';

/** Bottom sheet where the applicant pastes or imports their resume (stored on the phone only). */
@Component({
  selector: 'app-resume-sheet',
  templateUrl: './resume-sheet.component.html',
  styleUrls: ['./resume-sheet.component.scss'],
  standalone: false,
})
export class ResumeSheetComponent implements OnChanges {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  /** Fires after the resume is saved or deleted. */
  @Output() changed = new EventEmitter<boolean>();

  readonly maxLength = MAX_RESUME_LENGTH;
  text = '';
  error = '';

  constructor(
    public store: ResumeService,
    private alerts: AlertController,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    if (this.open) {
      this.text = this.store.resume();
      this.error = '';
    }
  }

  reading = false;

  /** Imports a PDF, Word (.docx) or text file and puts its text in the box. */
  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (kindOf(file) === 'image') {
      this.error = 'Photos are read by the AI: close this and attach the photo in the chat with the paperclip button.';
      return;
    }
    this.reading = true;
    this.error = '';
    try {
      const att = await readAttachment(file);
      if (!att.text) {
        this.error = 'This looks like a scanned PDF with no text. Attach it in the chat instead so the AI can read it.';
        return;
      }
      this.text = att.text.slice(0, MAX_RESUME_LENGTH);
      this.error = validateResume(this.text);
    } catch (e) {
      this.error = e instanceof FileReadError ? e.message : 'Could not read that file.';
    } finally {
      this.reading = false;
      this.cdr.markForCheck(); // update the screen after the file is read
    }
  }

  save(): void {
    this.error = validateResume(this.text);
    if (this.error) {
      return;
    }
    this.store.save(this.text);
    this.changed.emit(true);
    this.closed.emit();
  }

  async remove(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Delete resume',
      message: 'Remove your resume from this phone?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.store.clear();
            this.text = '';
            this.changed.emit(false);
            this.closed.emit();
          },
        },
      ],
    });
    await alert.present();
  }
}
