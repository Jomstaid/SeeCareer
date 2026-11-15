import { Injectable, signal } from '@angular/core';

import { readJson, removeKey, writeJson } from './storage';

const resumeKey = 'seecareer.resume';
const consentKey = 'seecareer.aiConsent';

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
