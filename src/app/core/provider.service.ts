import { Injectable, signal } from '@angular/core';

import { DEFAULT_FREE_AI } from './defaults';
import { AiProvider, ModelStatus } from './models';
import { newId, readJson, writeJson } from './storage';

const PROVIDERS_KEY = 'seecareer.providers';
const HEALTH_KEY = 'seecareer.modelHealth';

/** A bare-IP address, as saved by early versions of the app. */
const OLD_ADDRESS = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/v1)?\/?$/;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Keeps the list of AI providers and the result of the last model health check.
 *
 * The built-in provider talks to a small proxy that holds the real API key on the server, so the app
 * never has a key for it: nothing secret is in the source code, the build or the device storage.
 * Providers the user adds themselves (Groq, OpenRouter, Gemini...) use the user's own key.
 */
@Injectable({ providedIn: 'root' })
export class ProviderService {
  readonly providers = signal<AiProvider[]>(this.load());
  readonly health = signal<ModelStatus[]>(readJson<ModelStatus[]>(HEALTH_KEY, []));
  readonly lastScan = signal<number>(readJson<number>(HEALTH_KEY + '.time', 0));

  // ---------- loading ----------
  /** First launch: add the built-in provider (address only, no key). */
  private load(): AiProvider[] {
    const saved = readJson<AiProvider[] | null>(PROVIDERS_KEY, null);
    if (saved) {
      return this.migrate(saved);
    }
    const first: AiProvider[] = [this.builtIn(newId())];
    writeJson(PROVIDERS_KEY, first);
    return first;
  }

  private builtIn(id: string, model = '', enabled = true): AiProvider {
    return {
      id,
      name: DEFAULT_FREE_AI.name,
      preset: 'free',
      baseUrl: DEFAULT_FREE_AI.baseUrl,
      apiKey: '',
      model,
      enabled,
      builtin: true,
    };
  }

  /**
   * Providers saved by older versions. Anything that points at the built-in address, or at the old bare-IP
   * address, becomes the built-in provider: its address is locked and any key saved with it is deleted,
   * because it needs none now. The user's model choice and on/off switch are kept.
   */
  private migrate(list: AiProvider[]): AiProvider[] {
    let changed = false;
    const fixed = list.map((p) => {
      const url = trimSlash(p.baseUrl);
      if (OLD_ADDRESS.test(url) || url === DEFAULT_FREE_AI.baseUrl) {
        if (!p.builtin || p.apiKey || p.baseUrl !== DEFAULT_FREE_AI.baseUrl || p.preset !== 'free') {
          changed = true;
        }
        return this.builtIn(p.id, p.model, p.enabled);
      }
      return p;
    });
    if (changed) {
      writeJson(PROVIDERS_KEY, fixed);
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
  /** Adds a new provider, or updates it when it already has an id that exists. */
  save(provider: Omit<AiProvider, 'id'> & { id?: string }): AiProvider {
    const list = [...this.providers()];
    const index = provider.id ? list.findIndex((p) => p.id === provider.id) : -1;
    // the built-in provider never stores a key and always keeps its own address
    const safe: Omit<AiProvider, 'id'> & { id?: string } = provider.builtin
      ? { ...provider, apiKey: '', baseUrl: DEFAULT_FREE_AI.baseUrl, preset: 'free', name: DEFAULT_FREE_AI.name }
      : provider;
    const stored: AiProvider = { ...safe, id: provider.id && index >= 0 ? provider.id : newId() };
    if (index >= 0) {
      list[index] = stored;
    } else {
      list.push(stored);
    }
    this.providers.set(list);
    writeJson(PROVIDERS_KEY, list);
    return stored;
  }

  remove(id: string): void {
    const list = this.providers().filter((p) => p.id !== id);
    this.providers.set(list);
    writeJson(PROVIDERS_KEY, list);
    this.setHealth(this.health().filter((h) => h.providerId !== id));
  }

  resetToDefault(): void {
    this.providers.set([]);
    writeJson(PROVIDERS_KEY, null);
    this.providers.set(this.load());
    this.setHealth([]);
  }

  setHealth(statuses: ModelStatus[]): void {
    this.health.set(statuses);
    this.lastScan.set(Date.now());
    writeJson(HEALTH_KEY, statuses);
    writeJson(HEALTH_KEY + '.time', this.lastScan());
  }

  /** Working models, fastest first. */
  workingModels(): ModelStatus[] {
    return this.health()
      .filter((h) => h.ok === true && this.get(h.providerId)?.enabled)
      .sort((a, b) => (a.latency ?? 99) - (b.latency ?? 99));
  }
}
