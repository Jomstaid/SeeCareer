import { Component, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';

import { AiService } from '../core/ai.service';
import { ChatStore } from '../core/chat-store.service';
import { PROVIDER_PRESETS } from '../core/defaults';
import { AiError, AiProvider, AppSettings, ProviderPreset } from '../core/models';
import { ProviderService } from '../core/provider.service';
import { SettingsService } from '../core/settings.service';
import { ResumeService } from '../core/resume.service';
import { FieldErrors, MAX_INSTRUCTIONS_LENGTH, validateProvider } from '../core/validators';

type StatusColor = 'muted' | 'ok' | 'warn' | 'danger';

/** Settings: add/test free AI providers (like CMDPilot), model health, theme and data. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage {
  readonly presets = PROVIDER_PRESETS;
  readonly maxInstructions = MAX_INSTRUCTIONS_LENGTH;
  instructions = '';

  // ----- provider form (two-way bound with ngModel) -----
  selectedId = '';
  presetKey = 'free';
  name = '';
  baseUrl = '';
  apiKey = '';
  model = '';
  enabled = true;
  showKey = false;

  errors: FieldErrors = {};
  busy = signal(false);
  statusText = signal('');
  statusColor = signal<StatusColor>('muted');

  constructor(
    public providers: ProviderService,
    public settings: SettingsService,
    public ai: AiService,
    private chats: ChatStore,
    public resume: ResumeService,
    private alerts: AlertController,
    private toast: ToastController,
  ) {
    this.instructions = this.settings.settings().customInstructions;
    const first = this.providers.providers()[0];
    if (first) {
      this.select(first);
      this.setStatus('');
    } else {
      this.applyPreset();
    }
  }

  get preset(): ProviderPreset {
    return this.presets.find((p) => p.key === this.presetKey) ?? this.presets[this.presets.length - 1];
  }

  // ---------- provider form ----------
  applyPreset(): void {
    const p = this.preset;
    this.name = p.key === 'custom' ? '' : p.label.replace(/ \(.*\)/, '');
    this.baseUrl = p.baseUrl;
    this.errors = {};
  }

  onPresetChange(): void {
    this.applyPreset();
    this.setStatus('');
  }

  openSignup(): void {
    if (this.preset.signup) {
      window.open(this.preset.signup, '_blank', 'noopener');
    }
  }

  newProvider(): void {
    this.selectedId = '';
    this.presetKey = 'groq';
    this.applyPreset();
    this.apiKey = '';
    this.model = '';
    this.enabled = true;
    this.showKey = false;
    this.setStatus('');
  }

  select(p: AiProvider): void {
    this.selectedId = p.id;
    this.presetKey = this.presets.some((x) => x.key === p.preset) ? p.preset : 'custom';
    this.name = p.name;
    this.baseUrl = p.baseUrl;
    this.apiKey = p.apiKey;
    this.model = p.model;
    this.enabled = p.enabled;
    this.errors = {};
    this.setStatus('Editing. Change what you need, then press Test & Save.', 'muted');
  }

  /** Validates, tests the connection (finds working models) and saves. */
  async testAndSave(): Promise<void> {
    const others = this.providers.providers().filter((p) => p.id !== this.selectedId).map((p) => p.name);
    const check = validateProvider(
      { name: this.name, baseUrl: this.baseUrl, apiKey: this.apiKey, model: this.model },
      others,
      this.presetKey !== 'custom',
    );
    this.errors = check.errors;
    if (!check.valid) {
      this.setStatus('Please fix the highlighted fields.', 'warn');
      return;
    }
    const data = { ...check.clean, preset: this.presetKey, enabled: this.enabled };
    this.busy.set(true);
    this.setStatus(`Testing ${data.name}… finding fast models.`, 'muted');
    try {
      const best = await this.ai.testProvider({ ...data, id: this.selectedId || 'test' });
      this.persist(data);
      this.setStatus(`${data.name} works (${best.model} answered in ${best.latency?.toFixed(1)}s). Saved.`, 'ok');
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Unexpected error.', 'models');
      if (err.kind === 'key') {
        this.errors = { apiKey: 'The server rejected this API key.' };
        this.setStatus('The API key was rejected. Check that you copied the whole key.', 'danger');
      } else {
        this.setStatus(`${err.message}`, 'warn');
        await this.askSaveAnyway(data, err.message);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async askSaveAnyway(data: Omit<AiProvider, 'id'>, reason: string): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Provider test failed',
      message: `${reason}\n\nSave it anyway? You can re-check it later.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save anyway',
          handler: () => {
            this.persist(data);
            this.setStatus(`Saved ${data.name}, but it is not working yet.`, 'warn');
          },
        },
      ],
    });
    await alert.present();
  }

  private persist(data: Omit<AiProvider, 'id'>): void {
    const saved = this.providers.save({ ...data, id: this.selectedId || undefined });
    this.selectedId = saved.id;
  }

  async confirmDelete(): Promise<void> {
    if (!this.selectedId) {
      this.setStatus('Select a provider in the list first.', 'warn');
      return;
    }
    const alert = await this.alerts.create({
      header: 'Delete provider',
      message: `Delete "${this.name}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.providers.remove(this.selectedId);
            this.newProvider();
            this.setStatus('Provider deleted.', 'muted');
          },
        },
      ],
    });
    await alert.present();
  }

  async toggleEnabled(p: AiProvider, event: Event): Promise<void> {
    event.stopPropagation();
    this.providers.save({ ...p, enabled: !p.enabled });
    if (this.selectedId === p.id) {
      this.enabled = !p.enabled;
    }
  }

  // ---------- model health ----------
  async recheck(): Promise<void> {
    if (!this.providers.enabled().length) {
      this.notify('Enable a provider first.');
      return;
    }
    await this.ai.scan();
    const n = this.providers.workingModels().length;
    this.notify(n ? `${n} model(s) working` : 'No model answered');
  }

  providerName(id: string): string {
    return this.providers.get(id)?.name ?? 'Unknown';
  }

  workingCount(p: AiProvider): number {
    return this.providers.health().filter((h) => h.providerId === p.id && h.ok).length;
  }

  // ---------- appearance / chat ----------
  setTheme(value: AppSettings['theme']): void {
    this.settings.update({ theme: value });
  }

  setFontSize(value: AppSettings['fontSize']): void {
    this.settings.update({ fontSize: value });
  }

  setMaxTokens(value: number): void {
    this.settings.update({ maxTokens: Number(value) });
  }

  setSaveHistory(value: boolean): void {
    this.settings.update({ saveHistory: value });
    if (!value) {
      this.chats.clearAll();
    }
  }

  saveInstructions(): void {
    this.settings.update({ customInstructions: this.instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH) });
    this.notify('AI instructions saved');
  }

  resetInstructions(): void {
    this.instructions = '';
    this.saveInstructions();
  }

  async confirmDeleteResume(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Delete resume',
      message: 'Remove your saved resume and your AI privacy choice from this phone?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.resume.clear();
            this.resume.setConsent(false);
            this.notify('Resume deleted');
          },
        },
      ],
    });
    await alert.present();
  }

  // ---------- data ----------
  async confirmClearChats(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Clear chat history',
      message: 'All saved conversations will be deleted from this phone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: () => {
            this.chats.clearAll();
            this.notify('Chat history cleared');
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmReset(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Reset AI providers',
      message: 'Removes your providers and restores the free built-in one that came with the app.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset',
          role: 'destructive',
          handler: () => {
            this.providers.resetToDefault();
            this.newProvider();
            this.notify('Providers reset');
          },
        },
      ],
    });
    await alert.present();
  }

  // ---------- helpers ----------
  private setStatus(text: string, color: StatusColor = 'muted'): void {
    this.statusText.set(text);
    this.statusColor.set(color);
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1800, position: 'top' });
    await t.present();
  }
}
