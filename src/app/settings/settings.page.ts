import { Component, signal, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';

import { AiService } from '../core/ai.service';
import { chatsFromBackup, chatsToBackup } from '../core/chatbackup';
import { ChatStore } from '../core/chatstore.service';
import { PROVIDER_PRESETS } from '../core/defaults';
import { deliverBlob } from '../core/fileexport';
import { AiError, AiProvider, AppSettings, ProviderPreset } from '../core/models';
import { ProviderService } from '../core/provider.service';
import { SettingsService } from '../core/settings.service';
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
  providers = inject(ProviderService);
  settings = inject(SettingsService);
  ai = inject(AiService);
  private chats = inject(ChatStore);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);

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
  /** True for the built-in provider: it needs no key, and its name and address cannot be changed. */
  locked = false;

  /** The add / edit form is a dialog that opens from the provider list. */
  formOpen = signal(false);

  errors: FieldErrors = {};
  busy = signal(false);
  statusText = signal('');
  statusColor = signal<StatusColor>('muted');

  constructor() {
    this.instructions = this.settings.settings().customInstructions;
    this.applyPreset();
  }

  /** Providers to pick from: the built-in one is only listed while editing it. */
  get choices(): ProviderPreset[] {
    return this.presets.filter((p) => p.key !== 'free' || this.locked);
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
    if (this.locked) {
      return;
    }
    this.applyPreset();
    this.setStatus('');
  }

  openSignup(): void {
    if (this.preset.signup) {
      window.open(this.preset.signup, '_blank', 'noopener');
    }
  }

  /** The "Add" button: an empty form in a dialog. */
  startNew(): void {
    this.newProvider();
    this.formOpen.set(true);
  }

  /** A provider tapped in the list: its settings in a dialog. */
  edit(p: AiProvider): void {
    this.select(p);
    this.setStatus('');
    this.formOpen.set(true);
  }

  newProvider(): void {
    this.selectedId = '';
    this.presetKey = 'groq';
    this.applyPreset();
    this.apiKey = '';
    this.model = '';
    this.enabled = true;
    this.showKey = false;
    this.locked = false;
    this.setStatus('');
  }

  select(p: AiProvider): void {
    this.selectedId = p.id;
    this.presetKey = this.presets.some((x) => x.key === p.preset) ? p.preset : 'custom';
    this.name = p.name;
    this.baseUrl = p.baseUrl;
    this.locked = !!p.builtin;
    this.apiKey = p.builtin ? '' : p.apiKey; // the built-in key never reaches this screen
    this.model = p.model;
    this.enabled = p.enabled;
    this.errors = {};
  }

  /** Validates, tests the connection (finds working models) and saves. */
  async testAndSave(): Promise<void> {
    if (this.locked) {
      await this.testAndSaveLocked();
      return;
    }
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

  /** The built-in provider: only the model and the on/off switch can change. It needs no key. */
  private async testAndSaveLocked(): Promise<void> {
    const raw = this.providers.providers().find((p) => p.id === this.selectedId);
    if (!raw) {
      return;
    }
    const model = this.model.trim();
    if (/\s/.test(model) || model.length > 100) {
      this.errors = { model: 'Model name cannot contain spaces and must be under 100 characters.' };
      this.setStatus('Please fix the highlighted fields.', 'warn');
      return;
    }
    this.errors = {};
    const data = { ...raw, model, enabled: this.enabled };
    this.busy.set(true);
    this.setStatus(`Testing ${raw.name}… finding fast models.`, 'muted');
    try {
      const best = await this.ai.testProvider({ ...raw, model, enabled: this.enabled });
      this.persist(data);
      this.setStatus(`${raw.name} works (${best.model} answered in ${best.latency?.toFixed(1)}s). Saved.`, 'ok');
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Unexpected error.', 'models');
      this.setStatus(err.message, err.kind === 'key' ? 'danger' : 'warn');
      if (err.kind !== 'key') {
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
    this.formOpen.set(false);
    void this.notify(`${data.name} saved`);
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
            this.formOpen.set(false);
            void this.notify('Provider deleted');
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

  /** Models that answered (a provider that could not be reached at all is shown too, so the reason is visible). */
  get shown() {
    return this.providers.health().filter((h) => h.ok !== false || h.model === '*');
  }

  /** Models that did not answer and are not used. */
  get skipped(): number {
    return this.providers.health().filter((h) => h.ok === false && h.model !== '*').length;
  }

  /** The model name without the provider path in front of it. */
  shortModel(h: { providerId: string; model: string }): string {
    return h.model === '*' ? this.providerName(h.providerId) : (h.model.split('/').pop() ?? h.model);
  }

  /** How long the bar for a model is: the faster it answered, the longer the bar (full at 0 s, short at 6 s or more). */
  speed(latency: number): number {
    return Math.max(10, Math.min(100, 100 - (latency / 6) * 90));
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

  // ---------- data ----------
  /** Saves every chat in one file the user can keep. */
  async exportChats(): Promise<void> {
    const chats = this.chats.conversations();
    if (!chats.length) {
      void this.notify('There are no chats to export yet.');
      return;
    }
    const blob = new Blob([chatsToBackup(chats)], { type: 'application/json' });
    void this.notify(await deliverBlob(blob, `seecareerchats${new Date().toISOString().slice(0, 10)}.json`));
  }

  /** Reads a backup file picked by the user and adds its chats. */
  async importChats(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      // read the file first, then reset the picker so the same file can be chosen again
      const text = await file.text();
      input.value = '';
      const count = this.chats.importChats(chatsFromBackup(text));
      void this.notify(`Imported ${count} chat${count === 1 ? '' : 's'}`);
    } catch (e) {
      input.value = '';
      void this.notify(e instanceof Error ? e.message : 'Could not import this file.');
    }
  }

  async confirmClearChats(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Clear chat history',
      message: 'All saved conversations will be deleted from this device.',
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
