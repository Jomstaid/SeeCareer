import { Injectable, signal } from '@angular/core';

import { DEFAULT_SETTINGS } from './defaults';
import { AppSettings } from './models';
import { readJson, writeJson } from './storage';

const KEY = 'seecareer.settings';

/** Stores the app settings (theme, reply length, history, text size) and applies the theme. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<AppSettings>({ ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(KEY, {}) });

  constructor() {
    this.apply();
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.apply());
    }
  }

  update(patch: Partial<AppSettings>): void {
    this.settings.set({ ...this.settings(), ...patch });
    writeJson(KEY, this.settings());
    this.apply();
  }

  private apply(): void {
    const { theme, fontSize } = this.settings();
    const prefersDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const dark = theme === 'dark' || (theme === 'system' && prefersDark);
    const root = document.documentElement;
    root.classList.toggle('ion-palette-dark', dark);
    root.dataset['fontsize'] = fontSize;
  }
}
