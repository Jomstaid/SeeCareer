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
// "hormachuelos/claude-sonnet-4-6" is in the group "hormachuelos"; a model without a slash is its own group.
export function groupOf(model: string): string {
  const i = model.lastIndexOf('/');
  return i > 0 ? model.slice(0, i) : model;
}

// Takes turns between groups, keeping the order inside each group: [a1, a2, b1, c1, b2] becomes [a1, b1, c1, a2, b2].
// When one group's server is down, the next try is already a model from another server.
export function spreadGroups(models: string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const m of models) {
    const g = groupOf(m);
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const lists = [...groups.values()];
  const out: string[] = [];
  for (let i = 0; out.length < models.length; i++) {
    for (const l of lists) {
      if (i < l.length) {
        out.push(l[i]);
      }
    }
  }
  return out;
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
      const reason = String((error.error as { error?: { message?: string } } | null)?.error?.message ?? '');
      if (error.status === 401 || error.status === 403) {
        // the built in AI has no key, so a "no" from it is about that one model ("not available on your account");
        // the same goes for a message that talks about the model and not the key
        if (!p.apiKey || (/model/i.test(reason) && !/api.?key|token|auth/i.test(reason))) {
          return new AiError('Not available right now.', 'models');
        }
        return new AiError(`The API key for ${p.name} was rejected.`, 'key');
      }
      if (error.status === 0) {
        return new AiError(`Cannot reach ${p.baseUrl}. Check the URL and your internet connection.`, 'network');
      }
      if (error.status === 429) {
        return new AiError('Rate limited (too many requests).', 'models');
      }
      if (error.status === 404) {
        return new AiError('Model not found.', 'models');
      }
      return new AiError(error.status >= 500 ? `Server error (HTTP ${error.status}).` : `HTTP ${error.status}`, 'models');
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
    return this.listModels(p);
  }

  // Every chat model of the provider (smartest first). The list is saved, so Settings shows all of them
  // and the chat can still use any of them when the checked ones stop answering.
  async listModels(p: AiProvider): Promise<string[]> {
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
    const ordered = orderModels(ids, preset?.preferred ?? [], preset?.preferPrefixes ?? []);
    if (ordered.length) {
      this.store.setCatalog(p.id, ordered);
    }
    return ordered;
  }

  // Tests one model (the Test button in Settings) and saves the result.
  async checkModel(p: AiProvider, model: string): Promise<ModelStatus> {
    try {
      const ok: ModelStatus = { providerId: p.id, model, ok: true, latency: await this.ping(p, model) };
      this.store.setOne(ok);
      return ok;
    } catch (e) {
      const bad: ModelStatus = { providerId: p.id, model, ok: false, error: this.toAiError(e, p).message };
      this.store.setOne(bad);
      return bad;
    }
  }

  // Models that were not tried yet, from the full list of every enabled provider (smartest first). They are used
  // when all the working models fail in the middle of a question, so the user still gets an answer.
  // A group is the part in front of the model name ("hormachuelos/claude-sonnet-4-6" is in "hormachuelos"): models of one
  // group share a server, so when that server says "too many requests", the other models of the group are skipped.
  private backupRoutes(tried: ModelStatus[], limit: number, busyGroups = new Set<string>()): ModelStatus[] {
    const used = new Set(tried.map((r) => r.providerId + ' ' + r.model));
    const failed = new Set(this.store.health().filter((h) => h.ok === false).map((h) => h.providerId + ' ' + h.model));
    const lists = this.store.enabled().map((p) =>
      spreadGroups(p.model ? [p.model] : (this.store.catalog()[p.id] ?? []))
        .filter((m) => !used.has(p.id + ' ' + m) && !failed.has(p.id + ' ' + m) && !busyGroups.has(p.id + ' ' + groupOf(m)))
        .map((model): ModelStatus => ({ providerId: p.id, model, ok: null })),
    );
    // take turns between providers so one provider that is down does not use up every try
    const out: ModelStatus[] = [];
    for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        if (i < l.length && out.length < limit) {
          out.push(l[i]);
        }
      }
    }
    return out;
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
    all = spreadGroups(all);
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
  // Backup models (not tested yet) are asked faster: a new one every 4 seconds, up to 4 at once, 25 seconds each at most.
  private firstAnswer(routes: ModelStatus[], messages: ApiMessage[], maxTokens: number, options: ChatOptions, errors: string[], backup = false): Promise<ChatResult | null> {
    const waitBeforeNext = backup ? 4000 : options.fast ? 8000 : 10000;
    const atOnce = backup ? 4 : 3;
    const timeLimit = backup ? 25000 : options.fast ? 30000 : chatTimeoutMs;
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
        this.complete(provider, route.model, messages, maxTokens, timeLimit, options.temperature)
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
        if (running < atOnce) {
          timer = setTimeout(launch, waitBeforeNext);
        }
      };
      launch();
    });
  }

  // Asks up to 8 models that were not tried yet. A model that answers is marked as working.
  private async tryBackup(tried: ModelStatus[], messages: ApiMessage[], maxTokens: number, options: ChatOptions, errors: string[]): Promise<ChatResult | null> {
    // groups whose models just said "too many requests" (from this question or from the last check)
    // (one model can be rate limited on its own, so a group counts as busy only when 2 or more of its models are)
    const limited = new Map<string, Set<string>>();
    for (const h of [...this.store.health(), ...tried]) {
      if (h.ok === false && /rate limited/i.test(h.error ?? '')) {
        const g = h.providerId + ' ' + groupOf(h.model);
        limited.set(g, (limited.get(g) ?? new Set()).add(h.model));
      }
    }
    const busyGroups = new Set([...limited].filter(([, models]) => models.size >= 2).map(([g]) => g));
    // a provider whose full list is not saved yet (for example after an app update): get the list first
    const noList = this.store.enabled().filter((p) => !p.model && !this.store.catalog()[p.id]?.length);
    if (noList.length) {
      await Promise.all(noList.map((p) => this.listModels(p).catch(() => [])));
    }
    const backup = this.backupRoutes(tried, 8, busyGroups);
    if (!backup.length) {
      return null;
    }
    const started = performance.now();
    const saved = await this.firstAnswer(backup, messages, maxTokens, options, errors, true).catch((e) => {
      if (e instanceof AiError && (e.kind === 'cancelled' || e.kind === 'key')) {
        throw e;
      }
      return null;
    });
    if (saved) {
      const route = backup.find((r) => r.model === saved.model);
      if (route) {
        this.store.setOne({ ...route, ok: true, latency: (performance.now() - started) / 1000 });
      }
    }
    return saved;
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
      // the check found nothing that works: still try the other models from the full list before giving up
      const spare = await this.tryBackup([], messages, maxTokens, options, []);
      if (spare) {
        return spare;
      }
      const reasons = this.store
        .health()
        .map((h) => h.error)
        .filter(Boolean);
      if (reasons.length && reasons.filter((r) => /rate limited|timed out/i.test(r ?? '')).length >= reasons.length / 2) {
        throw new AiError('The free AI is busy right now (too many people are using it). Please try again in a minute.', 'models');
      }
      const wrongKey = reasons.some((r) => /rejected/.test(r ?? ''));
      const ownProvider = providers.some((p) => !p.builtin);
      throw new AiError(
        wrongKey || ownProvider
          ? 'No AI model is working right now. ' + (reasons[0] ?? 'Check your internet and Settings.')
          : 'The free AI is not answering right now. Please check your internet, or try again in a minute.',
        wrongKey ? 'key' : 'models',
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
    // every working model failed while answering: go down the full model list so the question still gets an answer
    const saved = await this.tryBackup(routes, messages, maxTokens, options, errors);
    if (saved) {
      return saved;
    }
    // most models said "too many requests" (the rest had server errors or were too slow): the free AI is busy,
    // and checking again now would only make it worse
    const busyNow = errors.filter((e) => /rate limited|too many/i.test(e)).length;
    const brokenNow = errors.filter((e) => /rate limited|too many|server error|timed out|not available/i.test(e)).length;
    if (errors.length && busyNow > 0 && brokenNow === errors.length) {
      throw new AiError('The free AI is busy right now (too many people are using it). Please try again in a minute.', 'models');
    }
    // everything that was working failed: check again right now and try the models that answer today (once)
    if (!retried) {
      await this.scan();
      if (this.store.workingModels().length) {
        return this.chat(messages, maxTokens, options, true);
      }
    }
    // a user's own provider can have a clear reason (like a wrong model name); the free AI gets a simple message
    const own = this.store.enabled().some((p) => !p.builtin);
    throw new AiError(
      own && errors[0] ? 'No AI model is working right now. ' + errors[0] : 'The free AI is not answering right now. Please try again in a minute.',
      'models',
    );
  }
}
