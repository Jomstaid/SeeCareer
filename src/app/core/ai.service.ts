import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { EmptyError, Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';

import { AUTO_CHECK_MS, MAX_SCAN_PER_PROVIDER, MIN_WORKING, NOT_CHAT_MODELS, PROVIDER_PRESETS } from './defaults';
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
  private http = inject(HttpClient);
  private store = inject(ProviderService);

  readonly scanning = signal(false);

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

  private readonly cancel$ = new Subject<void>();

  /** Stops every question that is waiting for an answer (the Stop button). */
  cancelAll(): void {
    this.cancel$.next();
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
    let res: CompletionResponse;
    try {
      res = await firstValueFrom(
        this.http
          .post<CompletionResponse>(this.url(p, '/chat/completions'), body, { headers: this.headers(p) })
          .pipe(timeout(timeoutMs), takeUntil(this.cancel$)),
      );
    } catch (e) {
      if (e instanceof EmptyError) {
        throw new AiError('Stopped.', 'cancelled');
      }
      throw e;
    }
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
    let all: string[];
    try {
      all = await this.discoverModels(p);
    } catch (e) {
      return [{ providerId: p.id, model: '*', ok: false, error: this.toAiError(e, p).message }];
    }
    if (!all.length) {
      return [{ providerId: p.id, model: '*', ok: false, error: 'No chat models found.' }];
    }
    // check the best models first; if too few of them answer, keep going down the list (up to 3 rounds)
    const results: ModelStatus[] = [];
    for (let round = 0; round < 3; round++) {
      const batch = all.slice(round * MAX_SCAN_PER_PROVIDER, (round + 1) * MAX_SCAN_PER_PROVIDER);
      if (!batch.length) {
        break;
      }
      results.push(
        ...(await Promise.all(
          batch.map(async (model): Promise<ModelStatus> => {
            try {
              return { providerId: p.id, model, ok: true, latency: await this.ping(p, model) };
            } catch (e) {
              return { providerId: p.id, model, ok: false, error: this.toAiError(e, p).message };
            }
          }),
        )),
      );
      if (results.filter((r) => r.ok).length >= MIN_WORKING) {
        break;
      }
    }
    return results;
  }

  // ---------- automatic checking ----------
  private autoTimer?: ReturnType<typeof setInterval>;

  /**
   * Keeps the list of working models fresh without the user doing anything: checks at start (when the last
   * check is old), every few minutes, when the phone comes back online and when the app is opened again.
   * Models that stopped answering drop out; models that recovered come back.
   */
  startAutoCheck(): void {
    if (this.autoTimer || typeof window === 'undefined') {
      return;
    }
    const due = (maxAgeMs: number) => Date.now() - this.store.lastScan() > maxAgeMs;
    const check = (maxAgeMs: number) => {
      if (!this.scanning() && this.store.enabled().length && due(maxAgeMs)) {
        void this.scan().catch(() => undefined);
      }
    };
    setTimeout(() => check(AUTO_CHECK_MS / 2), 1500);
    this.autoTimer = setInterval(() => check(AUTO_CHECK_MS - 5000), AUTO_CHECK_MS);
    window.addEventListener('online', () => check(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        check(AUTO_CHECK_MS / 2);
      }
    });
  }

  /** A model failed while answering: stop using it until the next check proves it works again. */
  private demote(providerId: string, model: string, reason: string): void {
    this.store.setHealth(
      this.store.health().map((h) => (h.providerId === providerId && h.model === model ? { ...h, ok: false, error: reason } : h)),
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
  async chat(messages: ApiMessage[], requestedTokens = 800, options: ChatOptions = {}, retried = false): Promise<ChatResult> {
    // models that think before they answer spend part of this budget on thinking: a tiny limit cuts the answer off
    const maxTokens = Math.max(requestedTokens, 700);
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
        if (err.kind === 'key' || err.kind === 'cancelled') {
          throw err;
        }
        this.demote(route.providerId, route.model, err.message);
      }
    }
    // everything that was working failed: check again right now and try the models that answer today (once)
    if (!retried) {
      await this.scan();
      if (this.store.workingModels().length) {
        return this.chat(messages, maxTokens, options, true);
      }
    }
    throw new AiError('No AI model is working right now. ' + (errors[0] ?? 'Check your internet and Settings.'), 'models');
  }
}
