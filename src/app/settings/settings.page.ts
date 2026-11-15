import { Component, computed, signal, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';

import { AiService } from '../core/ai.service';
import { chatsFromBackup, chatsToBackup } from '../core/chatbackup';
import { ChatStore } from '../core/chatstore.service';
import { providerPresets } from '../core/defaults';
import { deliverBlob } from '../core/fileexport';
import { AiError, AiProvider, AppSettings, ModelStatus, ProviderPreset } from '../core/models';
import { ProviderService } from '../core/provider.service';
import { SettingsService } from '../core/settings.service';
import { FieldErrors, maxInstructionsLength, validateProvider } from '../core/validators';

type StatusColor = 'muted' | 'ok' | 'warn' | 'danger';

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

  readonly presets = providerPresets;
  readonly maxInstructions = maxInstructionsLength;
  instructions = '';

  selectedId = '';
  presetKey = 'free';
  name = '';
  baseUrl = '';
  apiKey = '';
  model = '';
  enabled = true;
  showKey = false;
  locked = false;

  formOpen = signal(false);

  errors: FieldErrors = {};
  busy = signal(false);
  statusText = signal('');
  statusColor = signal<StatusColor>('muted');

  modelSearch = '';
  modelFilter: 'all' | 'ok' | 'new' | 'bad' = 'all';
  modelLimit = 30;
  loadingList = signal(false);
  testingOne = signal('');

  constructor() {
    this.instructions = this.settings.settings().customInstructions;
    this.applyPreset();
  }

  async ionViewWillEnter(): Promise<void> {
    const missing = this.providers.enabled().filter((p) => !p.model && !this.providers.catalog()[p.id]?.length);
    if (!missing.length) {
      return;
    }
    this.loadingList.set(true);
    await Promise.all(missing.map((p) => this.ai.listModels(p).catch(() => [])));
    this.loadingList.set(false);
  }

  get choices(): ProviderPreset[] {
    return this.presets.filter((p) => p.key !== 'free' || this.locked);
  }

  get preset(): ProviderPreset {
    return this.presets.find((p) => p.key === this.presetKey) ?? this.presets[this.presets.length - 1];
  }

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

  startNew(): void {
    this.newProvider();
    this.formOpen.set(true);
  }

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
    this.apiKey = p.builtin ? '' : p.apiKey;
    this.model = p.model;
    this.enabled = p.enabled;
    this.errors = {};
  }

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

  async recheck(): Promise<void> {
    if (!this.providers.enabled().length) {
      this.notify('Enable a provider first.');
      return;
    }
    await this.ai.scan();
    const n = this.providers.workingModels().length;
    this.notify(n ? `${n} model(s) working. Checking the rest in the background.` : 'No model answered yet. Checking the rest in the background.');
    void this.ai.sweep(true);
  }

  private readonly rowList = computed(() => {
    const health = this.providers.health();
    const out: ModelStatus[] = [];
    for (const p of this.providers.enabled()) {
      const mine = new Map(health.filter((h) => h.providerId === p.id).map((h) => [h.model, h]));
      const list = p.model ? [p.model] : (this.providers.catalog()[p.id] ?? []);
      const names = new Set(list);
      out.push(...[...mine.values()].filter((h) => !names.has(h.model)));
      for (const model of list) {
        out.push(mine.get(model) ?? { providerId: p.id, model, ok: null });
      }
    }
    const rank = (h: ModelStatus) => (h.ok === true ? 0 : h.ok === null ? 1 : 2);
    return out
      .map((h, i) => ({ h, i }))
      .sort((a, b) => rank(a.h) - rank(b.h) || (a.h.ok ? (a.h.latency ?? 99) - (b.h.latency ?? 99) : a.i - b.i))
      .map((x) => x.h);
  });

  get allRows(): ModelStatus[] {
    return this.rowList();
  }

  get rows(): ModelStatus[] {
    const q = this.modelSearch.trim().toLowerCase();
    return this.allRows.filter((h) => {
      const show = this.modelFilter === 'all' || (this.modelFilter === 'ok' ? h.ok === true : this.modelFilter === 'bad' ? h.ok === false : h.ok === null);
      return show && (!q || h.model.toLowerCase().includes(q));
    });
  }

  get countOk(): number {
    return this.allRows.filter((h) => h.ok === true).length;
  }

  get countBad(): number {
    return this.allRows.filter((h) => h.ok === false && h.model !== '*').length;
  }

  groupOf(h: ModelStatus): string {
    const parts = h.model.split('/');
    return parts.length > 1 ? `${this.providerName(h.providerId)} · ${parts.slice(0, -1).join('/')}` : this.providerName(h.providerId);
  }

  async testOne(h: ModelStatus): Promise<void> {
    const p = this.providers.get(h.providerId);
    if (!p) {
      return;
    }
    this.testingOne.set(h.providerId + h.model);
    const r = await this.ai.checkModel(p, h.model);
    this.testingOne.set('');
    this.notify(r.ok ? `${this.shortModel(r)} works (${r.latency?.toFixed(1)}s)` : `${this.shortModel(r)} did not answer`);
  }

  async checkAll(): Promise<void> {
    if (!this.providers.enabled().length) {
      this.notify('Enable a provider first.');
      return;
    }
    await this.ai.sweep(true);
    this.notify(`Done. ${this.countOk} model(s) working.`);
  }

  shortModel(h: { providerId: string; model: string }): string {
    return h.model === '*' ? this.providerName(h.providerId) : (h.model.split('/').pop() ?? h.model);
  }

  speed(latency: number): number {
    return Math.max(10, Math.min(100, 100 - (latency / 6) * 90));
  }

  providerName(id: string): string {
    return this.providers.get(id)?.name ?? 'Unknown';
  }

  workingCount(p: AiProvider): number {
    return this.providers.health().filter((h) => h.providerId === p.id && h.ok).length;
  }

  setTheme(value: AppSettings['theme']): void {
    this.settings.update({ theme: value });
  }

  setFontSize(value: AppSettings['fontSize']): void {
    this.settings.update({ fontSize: value });
  }

  setMaxTokens(value: number): void {
    this.settings.update({ maxTokens: Number(value) });
  }

  async setSaveHistory(value: boolean, toggle?: { checked: boolean }): Promise<void> {
    if (value) {
      this.settings.update({ saveHistory: true });
      return;
    }
    if (!this.chats.conversations().length) {
      this.settings.update({ saveHistory: false });
      return;
    }
    const alert = await this.alerts.create({
      header: 'Stop saving chats?',
      message: 'Your saved chats will be deleted from this device.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete and stop', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') {
      this.settings.update({ saveHistory: false });
      this.chats.clearAll();
    } else {
      this.settings.update({ saveHistory: true });
      if (toggle) {
        toggle.checked = true;
      }
    }
  }

  saveInstructions(): void {
    this.settings.update({ customInstructions: this.instructions.trim().slice(0, maxInstructionsLength) });
    this.notify('AI instructions saved');
  }

  resetInstructions(): void {
    this.instructions = '';
    this.saveInstructions();
  }

  async exportChats(): Promise<void> {
    const chats = this.chats.conversations();
    if (!chats.length) {
      void this.notify('There are no chats to export yet.');
      return;
    }
    const blob = new Blob([chatsToBackup(chats)], { type: 'application/json' });
    void this.notify(await deliverBlob(blob, `seecareerchats${new Date().toISOString().slice(0, 10)}.json`));
  }

  async importChats(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
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

  private setStatus(text: string, color: StatusColor = 'muted'): void {
    this.statusText.set(text);
    this.statusColor.set(color);
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1800, position: 'top' });
    await t.present();
  }
}
