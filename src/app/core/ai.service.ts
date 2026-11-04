import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { MAX_SCAN_PER_PROVIDER, NOT_CHAT_MODELS, PROVIDER_PRESETS } from './defaults';
import { AiError, AiProvider, ChatResult, ModelStatus } from './models';
import { ProviderService } from './provider.service';

interface ModelsResponse {
  data?: { id: string }[];
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** Part of a message: text, or a picture (data URL) for vision models. */
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatOptions {
  /** Prefer the fastest model instead of the smartest. */
  fast?: boolean;
  /** 0 = precise, 1 = creative. */
  temperature?: number;
}

/** Lower = smarter. Larger models first (Sonnet/Opus class, then bigger Gemini models); small/lite models last. */
export function smartRank(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('sonnet')) return 0;
  if (m.includes('opus')) return 1;
  if (/gpt-?5|\bo[34]\b|gemini-?[23]\.?\d*-?pro/.test(m)) return 1;
  if (m.includes('flash') && (m.includes('high') || m.includes('medium'))) return 2;
  if (m.includes('gemini-3-flash') || m.includes('llama-3.3-70b') || m.includes('70b')) return 3;
  if (m.includes('flash') && !m.includes('lite')) return 4;
  if (m.includes('lite') || m.includes('mini') || m.includes('instant') || m.includes('small')) return 8;
  return 5;
}

const FAST_HINTS = ['flash', 'fast', 'lite', 'mini', 'instant', 'small', 'haiku'];
const SLOW_HINTS = ['thinking', 'reason', 'opus', 'r1', 'high', 'pro', 'ultra'];
const CHAT_TIMEOUT_MS = 45000;
const PING_TIMEOUT_MS = 25000;

/**
 * Talks to any OpenAI-compatible server (the built-in free gateway, Groq, OpenRouter, Gemini...).
 * Models are health-checked and the fastest working one is used; when it fails the next one takes over.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  readonly scanning = signal(false);

  constructor(
    private http: HttpClient,
    private store: ProviderService,
  ) {}

  // ---------- low-level calls ----------
  private headers(p: AiProvider): HttpHeaders {
    let headers = new HttpHeaders({ Accept: 'application/json' });
    if (p.apiKey) {
      headers = headers.set('Authorization', `Bearer ${p.apiKey}`);
    }
    return headers;
  }

  private url(p: AiProvider, path: string): string {
    return `${p.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  private toAiError(error: unknown, p: AiProvider): AiError {
    if (error instanceof AiError) {
      return error;
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) {
        return new AiError(`The API key for ${p.name} was rejected.`, 'key');
      }
      if (error.status === 0) {
        return new AiError(`Cannot reach ${p.baseUrl}. Check the URL and your internet connection.`, 'network');
      }
      if (error.status === 429) {
        return new AiError('Rate limited (too many requests).', 'models');
      }
      return new AiError(`HTTP ${error.status}`, 'models');
    }
    if ((error as { name?: string })?.name === 'TimeoutError') {
      return new AiError('Too slow (timed out).', 'models');
    }
    return new AiError((error as Error)?.message || 'Unknown error', 'models');
  }

  private async complete(
    p: AiProvider,
    model: string,
    messages: ApiMessage[],
    maxTokens: number,
    timeoutMs: number,
    temperature = 0.4,
  ): Promise<string> {
    const body = { model, messages, max_tokens: maxTokens, temperature, stream: false };
    const res = await firstValueFrom(
      this.http
        .post<CompletionResponse>(this.url(p, '/chat/completions'), body, { headers: this.headers(p) })
        .pipe(timeout(timeoutMs)),
    );
    const content = res?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AiError('Empty answer.', 'models');
    }
    return content;
  }

  // ---------- model discovery & health ----------
  /** Chat models the provider offers, best and fastest first. */
  async discoverModels(p: AiProvider): Promise<string[]> {
    if (p.model) {
      return [p.model];
    }
    const preset = PROVIDER_PRESETS.find((x) => x.key === p.preset);
    let ids: string[];
    try {
      const res = await firstValueFrom(
        this.http.get<ModelsResponse>(this.url(p, '/models'), { headers: this.headers(p) }).pipe(timeout(15000)),
      );
      ids = (res?.data ?? []).map((m) => m.id.replace(/^models\//, ''));
    } catch (e) {
      const err = this.toAiError(e, p);
      if (err.kind === 'key' || err.kind === 'network') {
        throw err;
      }
      return [...(preset?.preferred ?? [])];
    }
    const available = new Set(ids);
    const preferred = (preset?.preferred ?? []).filter((m) => available.has(m));
    const others = ids
      .filter((m) => !preferred.includes(m) && !NOT_CHAT_MODELS.some((w) => m.toLowerCase().includes(w)))
      .sort((a, b) => this.rank(a) - this.rank(b));
    return [...preferred, ...others];
  }

  private rank(model: string): number {
    const name = model.toLowerCase();
    let score = 1;
    if (FAST_HINTS.some((h) => name.includes(h))) {
      score = 0;
    }
    if (SLOW_HINTS.some((h) => name.includes(h))) {
      score = 2;
    }
    return score;
  }

  /** Sends a tiny question and measures how long the model takes. Throws if it does not answer. */
  async ping(p: AiProvider, model: string): Promise<number> {
    const start = performance.now();
    try {
      await this.complete(p, model, [{ role: 'user', content: 'Reply with the single word: OK' }], 40, PING_TIMEOUT_MS);
    } catch (e) {
      throw this.toAiError(e, p);
    }
    return (performance.now() - start) / 1000;
  }

  /** Checks the best few models of each enabled provider (in parallel) and saves the result. */
  async scan(only?: AiProvider[]): Promise<ModelStatus[]> {
    const providers = only ?? this.store.enabled();
    this.scanning.set(true);
    try {
      const groups = await Promise.all(providers.map((p) => this.scanProvider(p)));
      const fresh = groups.flat();
      const keepOthers = this.store
        .health()
        .filter((h) => !providers.some((p) => p.id === h.providerId) && this.store.get(h.providerId));
      const all = [...keepOthers, ...fresh];
      all.sort((a, b) => this.order(a) - this.order(b) || (a.latency ?? 0) - (b.latency ?? 0));
      this.store.setHealth(all);
      return fresh;
    } finally {
      this.scanning.set(false);
    }
  }

  private order(s: ModelStatus): number {
    return s.ok === true ? 0 : s.ok === null ? 1 : 2;
  }

  private async scanProvider(p: AiProvider): Promise<ModelStatus[]> {
    let models: string[];
    try {
      models = (await this.discoverModels(p)).slice(0, MAX_SCAN_PER_PROVIDER);
    } catch (e) {
      return [{ providerId: p.id, model: '*', ok: false, error: this.toAiError(e, p).message }];
    }
    if (!models.length) {
      return [{ providerId: p.id, model: '*', ok: false, error: 'No chat models found.' }];
    }
    return Promise.all(
      models.map(async (model): Promise<ModelStatus> => {
        try {
          return { providerId: p.id, model, ok: true, latency: await this.ping(p, model) };
        } catch (e) {
          return { providerId: p.id, model, ok: false, error: this.toAiError(e, p).message };
        }
      }),
    );
  }

  /** Used by "Test & Save": throws a friendly AiError when nothing works, otherwise returns the best model. */
  async testProvider(p: AiProvider): Promise<ModelStatus> {
    const result = await this.scan([p]);
    const best = result.filter((r) => r.ok).sort((a, b) => (a.latency ?? 99) - (b.latency ?? 99))[0];
    if (best) {
      return best;
    }
    const first = result[0]?.error ?? 'No model answered.';
    const kind = /rejected/.test(first) ? 'key' : /reach/.test(first) ? 'network' : 'models';
    throw new AiError(kind === 'models' ? `No model answered correctly: ${first}` : first, kind);
  }

  // ---------- chat ----------
  /**
   * Answers a chat. By default it uses the SMARTEST working model first (larger models first, then smaller ones)
   * and falls back to the next one on errors. Pass `fast: true` for quick helper calls.
   */
  async chat(messages: ApiMessage[], maxTokens = 800, options: ChatOptions = {}): Promise<ChatResult> {
    const providers = this.store.enabled();
    if (!providers.length) {
      throw new AiError('No AI provider is enabled. Open Settings and add or enable one.', 'config');
    }
    if (!this.store.workingModels().length) {
      await this.scan();
    }
    let routes = this.store.workingModels();
    if (!routes.length) {
      const reasons = this.store
        .health()
        .map((h) => h.error)
        .filter(Boolean);
      throw new AiError(
        'No AI model is working right now. ' + (reasons[0] ?? 'Check your internet and Settings.'),
        reasons.some((r) => /rejected/.test(r ?? '')) ? 'key' : 'models',
      );
    }
    routes = [...routes]
      .sort((a, b) =>
        options.fast ? (a.latency ?? 99) - (b.latency ?? 99) : smartRank(a.model) - smartRank(b.model) || (a.latency ?? 99) - (b.latency ?? 99),
      )
      .slice(0, 6);
    const errors: string[] = [];
    for (const route of routes) {
      const provider = this.store.get(route.providerId);
      if (!provider) {
        continue;
      }
      try {
        const content = await this.complete(provider, route.model, messages, maxTokens, options.fast ? 30000 : CHAT_TIMEOUT_MS, options.temperature);
        return { content, model: route.model, providerName: provider.name };
      } catch (e) {
        const err = this.toAiError(e, provider);
        errors.push(`${route.model}: ${err.message}`);
        if (err.kind === 'key') {
          throw err;
        }
      }
    }
    // everything failed: force a re-check next time
    this.store.setHealth(this.store.health().map((h) => (routes.some((r) => r.model === h.model) ? { ...h, ok: null } : h)));
    throw new AiError('All AI models failed: ' + errors.join('; '), 'models');
  }
}
