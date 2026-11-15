import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { EmptyError, Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';

import { autoCheckMs, maxScanPerProvider, minWorking, notChatModels, providerPresets, sweepAtOnce, sweepEveryMs } from './defaults';
import { AiError, AiProvider, ChatResult, ModelStatus } from './models';
import { cleanIdentity } from './identity';
import { ProviderService } from './provider.service';
import { readJson, writeJson } from './storage';

const sweepKey = 'seecareer.modelSweep.time';

interface ModelsResponse {
  data?: { id: string; type?: string; output_modalities?: string[] }[];
}

export function writesText(m: { type?: string; output_modalities?: string[] }): boolean {
  if (m.type && /image|video|audio|embedding|tts|rerank/i.test(m.type)) {
    return false;
  }
  return !Array.isArray(m.output_modalities) || m.output_modalities.length === 0 || m.output_modalities.includes('text');
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatOptions {
  fast?: boolean;
  temperature?: number;
  spread?: number;
}

export function smartRank(model: string): number {
  const m = model.toLowerCase();
  if (/(^|[-/.])(mini|nano|lite|instant|small)(\b|$)/.test(m)) return 8;
  if (m.includes('sonnet')) return 0;
  if (m.includes('opus') || m.includes('fable')) return 1;
  if (/gpt-?[56]|grok-?4|\bo[34]\b|gemini-?[234]\.?\d*-?pro/.test(m)) return 1;
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

function speedRank(model: string): number {
  const name = model.toLowerCase();
  if (slowHints.some((h) => name.includes(h))) {
    return 2;
  }
  return fastHints.some((h) => name.includes(h)) ? 0 : 1;
}

export function orderModels(ids: string[], preferred: string[], prefixes: string[] = []): string[] {
  const chat = ids.filter((m) => !notChatModels.some((w) => m.toLowerCase().includes(w)));
  const available = new Set(chat);
  const first = preferred.filter((m) => available.has(m));
  const rest = chat.filter((m) => !first.includes(m));
  const slow = (m: string) => (speedRank(m) === 2 ? 1 : 0);
  const byQuality = (a: string, b: string) => slow(a) - slow(b) || smartRank(a) - smartRank(b) || speedRank(a) - speedRank(b);
  const matches = (m: string) => prefixes.some((p) => m.startsWith(p));
  return [...first, ...rest.filter(matches).sort(byQuality), ...rest.filter((m) => !matches(m)).sort(byQuality)];
}
export function groupOf(model: string): string {
  const i = model.lastIndexOf('/');
  return i > 0 ? model.slice(0, i) : model;
}

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

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);
  private store = inject(ProviderService);

  readonly scanning = signal(false);

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

  async discoverModels(p: AiProvider): Promise<string[]> {
    if (p.model) {
      return [p.model];
    }
    return this.listModels(p);
  }

  async listModels(p: AiProvider): Promise<string[]> {
    const preset = providerPresets.find((x) => x.key === p.preset);
    let ids: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await firstValueFrom(
          this.http.get<ModelsResponse>(this.url(p, '/models'), { headers: this.headers(p) }).pipe(timeout(15000)),
        );
        ids = (res?.data ?? []).filter(writesText).map((m) => m.id.replace(/^models\//, ''));
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

  private backupRoutes(tried: ModelStatus[], limit: number, busyGroups = new Set<string>()): ModelStatus[] {
    const used = new Set(tried.map((r) => r.providerId + ' ' + r.model));
    const failed = new Set(this.store.health().filter((h) => h.ok === false).map((h) => h.providerId + ' ' + h.model));
    const lists = this.store.enabled().map((p) =>
      spreadGroups(p.model ? [p.model] : (this.store.catalog()[p.id] ?? []))
        .filter((m) => !used.has(p.id + ' ' + m) && !failed.has(p.id + ' ' + m) && !busyGroups.has(p.id + ' ' + groupOf(m)))
        .map((model): ModelStatus => ({ providerId: p.id, model, ok: null })),
    );
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

  async ping(p: AiProvider, model: string): Promise<number> {
    const start = performance.now();
    try {
      await this.complete(p, model, [{ role: 'user', content: 'Reply with the single word: OK' }], 40, pingTimeoutMs);
    } catch (e) {
      throw this.toAiError(e, p);
    }
    return (performance.now() - start) / 1000;
  }

  private running?: Promise<ModelStatus[]>;
  private firstFound?: Promise<void>;
  private foundOne?: () => void;

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

  private async firstWorking(): Promise<void> {
    if (this.store.workingModels().length) {
      return;
    }
    const run = this.scan();
    await Promise.race([run, this.firstFound]);
  }

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
      const batchResults = results.slice(-batch.length);
      if (batchResults.every((r) => !r.ok && /rate limited/i.test(r.error ?? ''))) {
        break;
      }
    }
    return results;
  }

  private autoTimer?: ReturnType<typeof setInterval>;

  startAutoCheck(): void {
    if (this.autoTimer || typeof window === 'undefined') {
      return;
    }
    const due = (maxAgeMs: number) => Date.now() - this.store.lastScan() > maxAgeMs;
    const check = (maxAgeMs: number) => {
      if (!this.scanning() && this.store.enabled().length && due(maxAgeMs)) {
        void this.scan()
          .catch(() => undefined)
          .then(() => this.sweep());
      } else {
        void this.sweep();
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

  readonly sweeping = signal(false);
  readonly sweepDone = signal(0);
  readonly sweepTotal = signal(0);
  private stopSweep = false;

  async sweep(force = false): Promise<void> {
    if (this.sweeping() || this.scanning() || !this.store.enabled().length) {
      return;
    }
    if (!force && Date.now() - readJson<number>(sweepKey, 0) < sweepEveryMs) {
      return;
    }
    this.sweeping.set(true);
    this.stopSweep = false;
    try {
      const noList = this.store.enabled().filter((p) => !p.model && !this.store.catalog()[p.id]?.length);
      await Promise.all(noList.map((p) => this.listModels(p).catch(() => [])));
      const known = new Map(this.store.health().map((h) => [h.providerId + ' ' + h.model, h]));
      const todo: { p: AiProvider; model: string }[] = [];
      for (const p of this.store.enabled()) {
        for (const model of spreadGroups(p.model ? [p.model] : (this.store.catalog()[p.id] ?? []))) {
          if (force || known.get(p.id + ' ' + model)?.ok !== true) {
            todo.push({ p, model });
          }
        }
      }
      this.sweepTotal.set(todo.length);
      this.sweepDone.set(0);
      const busy = new Map<string, number>();
      let next = 0;
      const worker = async () => {
        while (next < todo.length && !this.stopSweep) {
          const { p, model } = todo[next++];
          const group = p.id + ' ' + groupOf(model);
          if ((busy.get(group) ?? 0) < 3 && this.store.get(p.id)?.enabled) {
            const r = await this.checkModel(p, model);
            if (!r.ok && /rate limited/i.test(r.error ?? '')) {
              busy.set(group, (busy.get(group) ?? 0) + 1);
            }
          }
          this.sweepDone.update((n) => n + 1);
        }
      };
      await Promise.all(Array.from({ length: sweepAtOnce }, worker));
      if (!this.stopSweep) {
        writeJson(sweepKey, Date.now());
      }
    } finally {
      this.sweeping.set(false);
    }
  }

  stopSweeping(): void {
    this.stopSweep = true;
  }

  private demote(providerId: string, model: string, reason: string): void {
    this.store.setHealth(
      this.store.health().map((h) => (h.providerId === providerId && h.model === model ? { ...h, ok: false, error: reason } : h)),
    );
  }

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
        if (running < atOnce) {
          timer = setTimeout(launch, waitBeforeNext);
        }
      };
      launch();
    });
  }

  private async tryBackup(tried: ModelStatus[], messages: ApiMessage[], maxTokens: number, options: ChatOptions, errors: string[]): Promise<ChatResult | null> {
    const limited = new Map<string, Set<string>>();
    for (const h of [...this.store.health(), ...tried]) {
      if (h.ok === false && /rate limited/i.test(h.error ?? '')) {
        const g = h.providerId + ' ' + groupOf(h.model);
        limited.set(g, (limited.get(g) ?? new Set()).add(h.model));
      }
    }
    const busyGroups = new Set([...limited].filter(([, models]) => models.size >= 2).map(([g]) => g));
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

  async chat(messages: ApiMessage[], requestedTokens = 800, options: ChatOptions = {}, retried = false): Promise<ChatResult> {
    const maxTokens = Math.max(requestedTokens, 700);
    const providers = this.store.enabled();
    if (!providers.length) {
      throw new AiError('No AI provider is enabled. Open Settings and add or enable one.', 'config');
    }
    await this.firstWorking();
    let routes = this.store.workingModels();
    if (!routes.length) {
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
    const saved = await this.tryBackup(routes, messages, maxTokens, options, errors);
    if (saved) {
      return saved;
    }
    const busyNow = errors.filter((e) => /rate limited|too many/i.test(e)).length;
    const brokenNow = errors.filter((e) => /rate limited|too many|server error|timed out|not available/i.test(e)).length;
    if (errors.length && busyNow > 0 && brokenNow === errors.length) {
      throw new AiError('The free AI is busy right now (too many people are using it). Please try again in a minute.', 'models');
    }
    if (!retried) {
      await this.scan();
      if (this.store.workingModels().length) {
        return this.chat(messages, maxTokens, options, true);
      }
    }
    const own = this.store.enabled().some((p) => !p.builtin);
    throw new AiError(
      own && errors[0] ? 'No AI model is working right now. ' + errors[0] : 'The free AI is not answering right now. Please try again in a minute.',
      'models',
    );
  }
}
