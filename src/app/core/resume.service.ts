import { Injectable, signal } from '@angular/core';

import { readJson, removeKey, writeJson } from './storage';

const resumeKey = 'seecareer.resume';
const consentKey = 'seecareer.aiConsent';

// Keeps the applicant's resume text on this phone only (no account, no server).
// It is sent to the AI provider only when the user runs an AI tool, after agreeing to the disclosure.
@Injectable({ providedIn: 'root' })
export class ResumeService {
  readonly resume = signal<string>(readJson<string>(resumeKey, ''));
  readonly consent = signal<boolean>(readJson<boolean>(consentKey, false));

  save(text: string): void {
    const value = text.trim();
    this.resume.set(value);
    writeJson(resumeKey, value);
  }

  clear(): void {
    this.resume.set('');
    removeKey(resumeKey);
  }

  setConsent(value: boolean): void {
    this.consent.set(value);
    writeJson(consentKey, value);
  }
}
