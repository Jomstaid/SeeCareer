import { Injectable, signal } from '@angular/core';

import { readJson, removeKey, writeJson } from './storage';

const RESUME_KEY = 'seecareer.resume';
const CONSENT_KEY = 'seecareer.aiConsent';

/**
 * Keeps the applicant's resume text on this phone only (no account, no server).
 * It is sent to the AI provider only when the user runs an AI tool, after agreeing to the disclosure.
 */
@Injectable({ providedIn: 'root' })
export class ResumeService {
  readonly resume = signal<string>(readJson<string>(RESUME_KEY, ''));
  readonly consent = signal<boolean>(readJson<boolean>(CONSENT_KEY, false));

  save(text: string): void {
    const value = text.trim();
    this.resume.set(value);
    writeJson(RESUME_KEY, value);
  }

  clear(): void {
    this.resume.set('');
    removeKey(RESUME_KEY);
  }

  setConsent(value: boolean): void {
    this.consent.set(value);
    writeJson(CONSENT_KEY, value);
  }
}
