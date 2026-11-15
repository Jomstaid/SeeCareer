import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { EmptyError, Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';

import { autoCheckMs, maxScanPerProvider, minWorking, notChatModels, providerPresets } from './defaults';
import { AiError, AiProvider, ChatResult, ModelStatus } from './models';
import { cleanIdentity } from './identity';
import { ProviderService } from './provider.service';

interface ModelsResponse {
  data?: { id: string }[];
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

// Part of a message: text, or a picture (data URL) for vision models.
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatOptions {
  // Prefer the fastest model instead of the smartest.
  fast?: boolean;
  // 0 = precise, 1 = creative.
  temperature?: number;
  // Start with the n th best model instead of the best (spreads calls that run at the same time over several models).
  spread?: number;
}

// Lower = smarter. Larger models first (Sonnet/Opus class, then bigger Gemini models); small/lite models last.
export function smartRank(model: string): number {
  const m = model.toLowerCase();
  // small versions first: "gpt-5.4-mini" is a small model even if its family is big
  if (/(^|[-/.])(mini|nano|lite|instant|small)(\b|$)/.test(m)) return 8;
  if (m.includes('sonnet')) return 0;
  if (m.includes('opus') || m.includes('fable')) return 1;
  if (/gpt-?[56]|grok-?4|\bo[34]\b|gemini-?[234]\.?\d*-?pro/.test(m)) return 1;
  // other big models on the free gateway
  if (/gemini-?4|kimi-?k3|deepseek-v4-pro|qwen.*max|glm-?5(\.\d)?(?!.*flash)|mimo.*pro/.test(m)) return 2;
  if (m.includes('haiku')) return 6;
  if (m.includes('flash') && (m.includes('high') || m.includes('medium'))) return 2;
  if (m.includes('gemini-3-flash') || m.includes('llama-3.3-70b') || m.includes('70b')) return 3;
  if (m.includes('flash') && !m.includes('lite')) return 4;
  if (m.includes('lite') || m.includes('mini') || m.includes('instant') || m.includes('small')) return 8;
  return 5;
}

const fastHints = ['flash', 'fast', 'lite', 'mini', 'instant', 'small', 'haiku'];
const slowHints = ['thinking', 'reason', 'opus', 'r1', 'high', 'pro', 'ultra'];

// 0 = probably quick, 1 = normal, 2 = probably slow (thinks first).
function speedRank(model: string): number {
  const name = model.toLowerCase();
  if (slowHints.some((h) => name.includes(h))) {
    return 2;
  }
  return fastHints.some((h) => name.includes(h)) ? 0 : 1;
}

// The order in which models are health checked: the preset's favourites (in their order), then every model that
// starts with one of the preset's prefixes (so a model added to the gateway later is found), then all the others.
// Within a group, smart models come first and slow "thinking" variants last. Nonchat models are left out.
export function orderModels(ids: string[], preferred: string[], prefixes: string[] = []): string[] {
  const chat = ids.filter((m) => !notChatModels.some((w) => m.toLowerCase().includes(w)));
  const available = new Set(chat);
  const first = preferred.filter((m) => available.has(m));
  const rest = chat.filter((m) => !first.includes(m));
  // smart models first, slow "thinking" variants last, and the quicker one when two are equally smart
  const slow = (m: string) => (speedRank(m) === 2 ? 1 : 0);
  const byQuality = (a: string, b: string) => slow(a) - slow(b) || smartRank(a) - smartRank(b) || speedRank(a) - speedRank(b);
  const matches = (m: string) => prefixes.some((p) => m.startsWith(p));
  return [...first, ...rest.filter(matches).sort(byQuality), ...rest.filter((m) => !matches(m)).sort(byQuality)];
}
const chatTimeoutMs = 45000;
const pingTimeoutMs = 25000;

// Talks to any OpenAI compatible server (the built in free gateway, Groq, OpenRouter, Gemini...).
// Models are health checked and the fastest working one is used; when it fails the next one takes over.
@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);
  private store = inject(ProviderService);

  readonly scanning = signal(false);

  // ---------- low level calls ----------
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

  // Stops every question that is waiting for an answer (the Stop button).
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
  // Chat models the provider offers, best and fastest first.
  async discoverModels(p: AiProvider): Promise<string[]> {
    if (p.model) {
      return [p.model];
    }
    const preset = providerPresets.find((x) => x.key === p.preset);
    let ids: string[] = [];
    // the model list can fail for a moment (a gateway hiccup): try twice before deciding
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await firstValueFrom(
          this.http.get<ModelsResponse>(this.url(p, '/models'), { headers: this.headers(p) }).pipe(timeout(15000)),
        );
        ids = (res?.data ?? []).map((m) => m.id.replace(/^models\//, ''));
        break;
      } catch (e) {
        const err = this.toAiError(e, p);
        if (err.kind === 'key') {
          throw err;
        }
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        // still no list: the favourite models are tried directly (the health check finds out if they answer)
        if (preset?.preferred.length) {
          return [...preset.preferred];
        }
        throw err;
      }
    }
    return orderModels(ids, preset?.preferred ?? [], preset?.preferPrefixes ?? []);
  }

  // Sends a tiny question and measures how long the model takes. Throws if it does not answer.
  async ping(p: AiProvider, model: string): Promise<number> {
    const start = performance.now();
    try {
      await this.complete(p, model, [{ role: 'user', content: 'Reply with the single word: OK' }], 40, pingTimeoutMs);
    } catch (e) {
      throw this.toAiError(e, p);
    }
    return (performance.now() - start) / 1000;
  }

  // The check of all providers that is running now: a second caller waits for it instead of starting another.
  private running?: Promise<ModelStatus[]>;
  // Resolves as soon as the running check finds its first working model.
  private firstFound?: Promise<void>;
  private foundOne?: () => void;

  // Checks the best few models of each enabled provider (in parallel) and saves the result.
  scan(only?: AiProvider[]): Promise<ModelStatus[]> {
    if (only) {
      return this.runScan(only);
    }
    if (!this.running) {
      this.firstFound = new Promise<void>((resolve) => (this.foundOne = resolve));
      this.running = this.runScan(this.store.enabled()).finally(() => {
        this.running = undefined;
        this.foundOne?.();
      });
    }
    return this.running;
  }

  // Waits only until at least one model is known to work: the first model that answers the check is used
  // right away, while the rest of the check finishes in the background.
  private async firstWorking(): Promise<void> {
    if (this.store.workingModels().length) {
      return;
    }
    const run = this.scan();
    await Promise.race([run, this.firstFound]);
  }

  // A model passed the check: it can be used straight away, before the whole check is done.
  private found(status: ModelStatus): void {
    if (!this.store.get(status.providerId)) {
      return;
    }
    const rest = this.store.health().filter((h) => !(h.providerId === status.providerId && h.model === status.model));
    this.store.setHealth([status, ...rest]);
    this.foundOne?.();
  }

  private async runScan(providers: AiProvider[]): Promise<ModelStatus[]> {
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
      const batch = all.slice(round * maxScanPerProvider, (round + 1) * maxScanPerProvider);
      if (!batch.length) {
        break;
      }
      results.push(
        ...(await Promise.all(
          batch.map(async (model): Promise<ModelStatus> => {
            try {
              const ok: ModelStatus = { providerId: p.id, model, ok: true, latency: await this.ping(p, model) };
              this.found(ok);
              return ok;
            } catch (e) {
              return { providerId: p.id, model, ok: false, error: this.toAiError(e, p).message };
            }
          }),
        )),
      );
      if (results.filter((r) => r.ok).length >= minWorking) {
        break;
      }
      // the whole batch said "too many requests": the server is busy, testing more models now only makes it worse
      const batchResults = results.slice(-batch.length);
      if (batchResults.every((r) => !r.ok && /rate limited/i.test(r.error ?? ''))) {
        break;
      }
    }
    return results;
  }

  // ---------- automatic checking ----------
  private autoTimer?: ReturnType<typeof setInterval>;

  // Keeps the list of working models fresh without the user doing anything: checks at start (when the last
  // check is old), every few minutes, when the phone comes back online and when the app is opened again.
  // Models that stopped answering drop out; models that recovered come back.
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
    setTimeout(() => check(autoCheckMs / 2), 1500);
    this.autoTimer = setInterval(() => check(autoCheckMs - 5000), autoCheckMs);
    window.addEventListener('online', () => check(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        check(autoCheckMs / 2);
      }
    });
  }

  // A model failed while answering: stop using it until the next check proves it works again.
  private demote(providerId: string, model: string, reason: string): void {
    this.store.setHealth(
      this.store.health().map((h) => (h.providerId === providerId && h.model === model ? { ...h, ok: false, error: reason } : h)),
    );
  }

  // Used by "Test & Save": throws a friendly AiError when nothing works, otherwise returns the best model.
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

  // Asks the models in order, but does not wait forever on one that hangs: if the first one has not answered
  // after a few seconds, the next one is asked too, and the first good answer wins (at most 3 at the same time).
  private firstAnswer(routes: ModelStatus[], messages: ApiMessage[], maxTokens: number, options: ChatOptions, errors: string[]): Promise<ChatResult | null> {
    const waitBeforeNext = options.fast ? 8000 : 10000;
    return new Promise<ChatResult | null>((resolve, reject) => {
      let next = 0;
      let running = 0;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        done = true;
        clearTimeout(timer);
      };
      const launch = () => {
        clearTimeout(timer);
        if (done) {
          return;
        }
        while (next < routes.length && !this.store.get(routes[next].providerId)) {
          next++;
        }
        if (next >= routes.length) {
          if (!running) {
            finish();
            resolve(null);
          }
          return;
        }
        const route = routes[next++];
        const provider = this.store.get(route.providerId)!;
        running++;
        this.complete(provider, route.model, messages, maxTokens, options.fast ? 30000 : chatTimeoutMs, options.temperature)
          .then((content) => {
            if (!done) {
              finish();
              resolve({ content: cleanIdentity(content), model: route.model, providerName: provider.name });
            }
          })
          .catch((e) => {
            running--;
            if (done) {
              return;
            }
            const err = this.toAiError(e, provider);
            errors.push(`${route.model}: ${err.message}`);
            if (err.kind === 'key' || err.kind === 'cancelled') {
              finish();
              reject(err);
              return;
            }
            this.demote(route.providerId, route.model, err.message);
            launch();
          });
        // still no answer after a while: ask the next model as well
        if (running < 3) {
          timer = setTimeout(launch, waitBeforeNext);
        }
      };
      launch();
    });
  }

  // ---------- chat ----------
  // Answers a chat. By default it uses the SMARTEST working model first (larger models first, then smaller ones)
  // and falls back to the next one on errors. Pass `fast: true` for quick helper calls.
  async chat(messages: ApiMessage[], requestedTokens = 800, options: ChatOptions = {}, retried = false): Promise<ChatResult> {
    // models that think before they answer spend part of this budget on thinking: a tiny limit cuts the answer off
    const maxTokens = Math.max(requestedTokens, 700);
    const providers = this.store.enabled();
    if (!providers.length) {
      throw new AiError('No AI provider is enabled. Open Settings and add or enable one.', 'config');
    }
    await this.firstWorking();
    let routes = this.store.workingModels();
    if (!routes.length) {
      const reasons = this.store
        .health()
        .map((h) => h.error)
        .filter(Boolean);
      if (reasons.length && reasons.filter((r) => /rate limited|timed out/i.test(r ?? '')).length >= reasons.length / 2) {
        throw new AiError('The free AI is busy right now (too many people are using it). Please try again in a minute.', 'models');
      }
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
    if (options.spread && routes.length > 1) {
      const n = options.spread % routes.length;
      routes = [...routes.slice(n), ...routes.slice(0, n)];
    }
    const errors: string[] = [];
    const won = await this.firstAnswer(routes, messages, maxTokens, options, errors);
    if (won) {
      return won;
    }
    // every model said "too many requests": the free AI is busy, checking again now would only make it worse
    if (errors.length && errors.every((e) => /rate limited|too many/i.test(e))) {
      throw new AiError('The free AI is busy right now (too many people are using it). Please try again in a minute.', 'models');
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
