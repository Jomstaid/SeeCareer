import { Injectable, signal } from '@angular/core';

import { defaultFreeAi, providerPresets } from './defaults';
import { AiProvider, ModelStatus } from './models';
import { newId, readJson, writeJson } from './storage';

const providersKey = 'seecareer.providers';
const healthKey = 'seecareer.modelHealth';
const catalogKey = 'seecareer.modelList';

// A bare IP address, as saved by early versions of the app.
const oldAddress = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/v1)?\/?$/;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

// Keeps the list of AI providers and the result of the last model health check.
// The built in provider talks to a small proxy that holds the real API key on the server, so the app
// never has a key for it: nothing secret is in the source code, the build or the device storage.
// Providers the user adds themselves (Groq, OpenRouter, Gemini...) use the user's own key.
@Injectable({ providedIn: 'root' })
export class ProviderService {
  readonly providers = signal<AiProvider[]>(this.load());
  readonly health = signal<ModelStatus[]>(this.freshHealth());
  readonly lastScan = signal<number>(readJson<number>(healthKey + '.time', 0));
  // Every chat model each provider offers (smartest first), so Settings can list them all and the chat can fall
  // back to any of them when the working ones fail.
  readonly catalog = signal<Record<string, string[]>>(readJson<Record<string, string[]>>(catalogKey, {}));

  // The saved check results, unless the app's list of favourite models changed since they were saved (a new app
  // version, new models on the gateway): then they are dropped so the new models are checked straight away.
  private freshHealth(): ModelStatus[] {
    const sig = providerPresets.map((p) => `${p.key}:${p.preferred.join(',')}|${(p.preferPrefixes ?? []).join(',')}`).join(';');
    if (readJson<string>(healthKey + '.sig', '') !== sig) {
      writeJson(healthKey, []);
      writeJson(healthKey + '.time', 0);
      writeJson(healthKey + '.sig', sig);
      return [];
    }
    return readJson<ModelStatus[]>(healthKey, []);
  }

  // ---------- loading ----------
  // First launch: add the built in provider (address only, no key).
  private load(): AiProvider[] {
    const saved = readJson<AiProvider[] | null>(providersKey, null);
    if (saved) {
      return this.migrate(saved);
    }
    const first: AiProvider[] = [this.builtIn(newId())];
    writeJson(providersKey, first);
    return first;
  }

  private builtIn(id: string, model = '', enabled = true): AiProvider {
    return {
      id,
      name: defaultFreeAi.name,
      preset: 'free',
      baseUrl: defaultFreeAi.baseUrl,
      apiKey: '',
      model,
      enabled,
      builtin: true,
    };
  }

  // Providers saved by older versions. Anything that points at the built in address, or at the old bare IP
  // address, becomes the built in provider: its address is locked and any key saved with it is deleted,
  // because it needs none now. The user's model choice and on/off switch are kept.
  private migrate(list: AiProvider[]): AiProvider[] {
    let changed = false;
    const fixed = list.map((p) => {
      const url = trimSlash(p.baseUrl);
      if (oldAddress.test(url) || url === defaultFreeAi.baseUrl) {
        if (!p.builtin || p.apiKey || p.baseUrl !== defaultFreeAi.baseUrl || p.preset !== 'free') {
          changed = true;
        }
        return this.builtIn(p.id, p.model, p.enabled);
      }
      return p;
    });
    if (changed) {
      writeJson(providersKey, fixed);
    }
    return fixed;
  }

  // ---------- reading ----------
  enabled(): AiProvider[] {
    return this.providers().filter((p) => p.enabled);
  }

  get(id: string): AiProvider | undefined {
    return this.providers().find((p) => p.id === id);
  }

  // ---------- changing ----------
  // Adds a new provider, or updates it when it already has an id that exists.
  save(provider: Omit<AiProvider, 'id'> & { id?: string }): AiProvider {
    const list = [...this.providers()];
    const index = provider.id ? list.findIndex((p) => p.id === provider.id) : -1;
    // the built in provider never stores a key and always keeps its own address
    const safe: Omit<AiProvider, 'id'> & { id?: string } = provider.builtin
      ? { ...provider, apiKey: '', baseUrl: defaultFreeAi.baseUrl, preset: 'free', name: defaultFreeAi.name }
      : provider;
    const stored: AiProvider = { ...safe, id: provider.id && index >= 0 ? provider.id : newId() };
    if (index >= 0) {
      list[index] = stored;
    } else {
      list.push(stored);
    }
    this.providers.set(list);
    writeJson(providersKey, list);
    return stored;
  }

  remove(id: string): void {
    const list = this.providers().filter((p) => p.id !== id);
    this.providers.set(list);
    writeJson(providersKey, list);
    const others = { ...this.catalog() };
    delete others[id];
    this.catalog.set(others);
    writeJson(catalogKey, others);
    this.setHealth(this.health().filter((h) => h.providerId !== id));
  }

  resetToDefault(): void {
    this.providers.set([]);
    writeJson(providersKey, null);
    this.providers.set(this.load());
    this.setHealth([]);
  }

  setCatalog(providerId: string, models: string[]): void {
    const next = { ...this.catalog(), [providerId]: models };
    this.catalog.set(next);
    writeJson(catalogKey, next);
  }

  // Saves the result of one model test without changing the time of the last full check.
  setOne(status: ModelStatus): void {
    const rest = this.health().filter((h) => !(h.providerId === status.providerId && h.model === status.model));
    const next = status.ok ? [status, ...rest] : [...rest, status];
    this.health.set(next);
    writeJson(healthKey, next);
  }

  setHealth(statuses: ModelStatus[]): void {
    this.health.set(statuses);
    this.lastScan.set(Date.now());
    writeJson(healthKey, statuses);
    writeJson(healthKey + '.time', this.lastScan());
  }

  // Working models, fastest first.
  workingModels(): ModelStatus[] {
    return this.health()
      .filter((h) => h.ok === true && this.get(h.providerId)?.enabled)
      .sort((a, b) => (a.latency ?? 99) - (b.latency ?? 99));
  }
}
