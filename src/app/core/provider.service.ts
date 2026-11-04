import { Injectable, signal } from '@angular/core';

import { DEFAULT_FREE_AI } from './defaults';
import { AiProvider, ModelStatus } from './models';
import { newId, readJson, writeJson } from './storage';

const PROVIDERS_KEY = 'seecareer.providers';
const HEALTH_KEY = 'seecareer.modelHealth';

/** Keeps the list of AI providers (free APIs) and the result of the last model health check. */
@Injectable({ providedIn: 'root' })
export class ProviderService {
  readonly providers = signal<AiProvider[]>(this.load());

  constructor() {
    void this.applyLocalConfig();
  }
  readonly health = signal<ModelStatus[]>(readJson<ModelStatus[]>(HEALTH_KEY, []));
  readonly lastScan = signal<number>(readJson<number>(HEALTH_KEY + '.time', 0));

  /** First launch: add the free AI gateway that was given for this project. */
  private load(): AiProvider[] {
    const saved = readJson<AiProvider[] | null>(PROVIDERS_KEY, null);
    if (saved) {
      return this.useBuiltInPreset(saved);
    }
    const first: AiProvider[] = [
      {
        id: newId(),
        name: DEFAULT_FREE_AI.name,
        preset: 'free',
        baseUrl: DEFAULT_FREE_AI.baseUrl,
        apiKey: DEFAULT_FREE_AI.apiKey,
        model: '',
        enabled: true,
      },
    ];
    writeJson(PROVIDERS_KEY, first);
    return first;
  }

  /**
   * Providers saved by older versions: a provider that points at the built-in gateway address
   * gets the built-in preset and name, so its model list and label stay correct.
   */
  private useBuiltInPreset(list: AiProvider[]): AiProvider[] {
    let changed = false;
    const fixed = list.map((p) => {
      if (p.baseUrl.replace(/\/+$/, '') === DEFAULT_FREE_AI.baseUrl && p.preset !== 'free') {
        changed = true;
        return { ...p, preset: 'free', name: DEFAULT_FREE_AI.name };
      }
      return p;
    });
    if (changed) {
      writeJson(PROVIDERS_KEY, fixed);
    }
    return fixed;
  }

  /**
   * Optional, git-ignored file src/assets/local-config.json: {"freeAi": {"apiKey": "..."}}.
   * If the built-in provider has no key yet, the key from this file is used.
   * A missing file is normal (for example on a fresh clone) and is simply ignored.
   */
  private async applyLocalConfig(): Promise<void> {
    try {
      const res = await fetch('assets/local-config.json', { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
      const key = ((await res.json()) as { freeAi?: { apiKey?: unknown } })?.freeAi?.apiKey;
      if (typeof key !== 'string' || !key.trim()) {
        return;
      }
      const target = this.providers().find((p) => p.preset === 'free' && !p.apiKey);
      if (target) {
        this.save({ ...target, apiKey: key.trim() });
      }
    } catch {
      /* no local config: fine */
    }
  }

  enabled(): AiProvider[] {
    return this.providers().filter((p) => p.enabled);
  }

  get(id: string): AiProvider | undefined {
    return this.providers().find((p) => p.id === id);
  }

  /** Adds a new provider, or updates it when it already has an id that exists. */
  save(provider: Omit<AiProvider, 'id'> & { id?: string }): AiProvider {
    const list = [...this.providers()];
    const index = provider.id ? list.findIndex((p) => p.id === provider.id) : -1;
    const stored: AiProvider = { ...provider, id: provider.id && index >= 0 ? provider.id : newId() };
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
