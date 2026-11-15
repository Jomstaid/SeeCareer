import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AiService } from './ai.service';
import { ProviderService } from './provider.service';

describe('AiService asks the next model when one hangs', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => vi.useRealTimers());

  function setup() {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setHealth([
      { providerId: id, model: 'hormachuelos/claude-sonnet-4-6', ok: true, latency: 2 },
      { providerId: id, model: 'ddgw/gpt-5.6-luna', ok: true, latency: 3 },
    ]);
    return TestBed.inject(AiService);
  }

  const modelOf = (r: { request: { body: unknown } }) => (r.request.body as { model: string }).model;

  it('uses the second model when the first one does not answer in time', async () => {
    vi.useFakeTimers();
    const ai = setup();
    const answer = ai.chat([{ role: 'user', content: 'hi' }]);
    await vi.advanceTimersByTimeAsync(0);
    const first = http.match(() => true);
    expect(first.map(modelOf)).toEqual(['hormachuelos/claude-sonnet-4-6']);
    await vi.advanceTimersByTimeAsync(10000);
    const second = http.match(() => true);
    expect(second.map(modelOf)).toEqual(['ddgw/gpt-5.6-luna']);
    second[0].flush({ choices: [{ message: { content: 'Hello from the second model' } }] });
    const result = await answer;
    expect(result.model).toBe('ddgw/gpt-5.6-luna');
    expect(result.content).toBe('Hello from the second model');
  });

  it('goes to the next model right away when one fails', async () => {
    const ai = setup();
    const answer = ai.chat([{ role: 'user', content: 'hi' }]);
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne((r) => modelOf({ request: r }) === 'hormachuelos/claude-sonnet-4-6').flush({}, { status: 500, statusText: 'Server error' });
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne((r) => modelOf({ request: r }) === 'ddgw/gpt-5.6-luna').flush({ choices: [{ message: { content: 'OK' } }] });
    expect((await answer).model).toBe('ddgw/gpt-5.6-luna');
  });
});

describe('AiService when the free AI is busy', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('stops checking after one busy batch and says the AI is busy', async () => {
    const ai = TestBed.inject(AiService);
    const answer = ai.chat([{ role: 'user', content: 'hi' }]).catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 0));
    const ids = Array.from({ length: 14 }, (_, i) => ({ id: `hormachuelos/model-${i}` }));
    http.expectOne((r) => r.url.endsWith('/models')).flush({ data: ids });
    await new Promise((r) => setTimeout(r, 0));
    const pings = http.match((r) => r.url.endsWith('/chat/completions'));
    expect(pings.length).toBe(6);
    pings.forEach((p) => p.flush({}, { status: 429, statusText: 'Too Many Requests' }));
    const err = (await answer) as Error;
    expect(http.match((r) => r.url.endsWith('/chat/completions')).length).toBe(0);
    expect(err.message).toMatch(/busy/i);
  });
});

describe('AiService falls back to the full model list', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  const modelOf = (r: { body: unknown }) => (r.body as { model: string }).model;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('uses a model that was not tested yet when the working ones fail', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['hormachuelos/a', 'hormachuelos/b', 'dva/c', 'cxa/d']);
    providers.setHealth([
      { providerId: id, model: 'hormachuelos/a', ok: true, latency: 2 },
      { providerId: id, model: 'hormachuelos/b', ok: true, latency: 3 },
    ]);
    const ai = TestBed.inject(AiService);
    const answer = ai.chat([{ role: 'user', content: 'hi' }]);
    await tick();
    http.expectOne((r) => modelOf(r) === 'hormachuelos/a').flush({}, { status: 500, statusText: 'Server error' });
    await tick();
    http.expectOne((r) => modelOf(r) === 'hormachuelos/b').flush({}, { status: 500, statusText: 'Server error' });
    await tick();
    http.expectOne((r) => modelOf(r) === 'dva/c').flush({ choices: [{ message: { content: 'Saved by the backup' } }] });
    const result = await answer;
    expect(result.model).toBe('dva/c');
    expect(result.content).toBe('Saved by the backup');
    expect(providers.workingModels().some((h) => h.model === 'dva/c')).toBe(true);
  });

  it('skips the busy group and tries another group', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['hormachuelos/a', 'hormachuelos/b', 'hormachuelos/x', 'dva/c']);
    providers.setHealth([
      { providerId: id, model: 'hormachuelos/a', ok: true, latency: 2 },
      { providerId: id, model: 'hormachuelos/b', ok: true, latency: 3 },
    ]);
    const ai = TestBed.inject(AiService);
    const answer = ai.chat([{ role: 'user', content: 'hi' }]);
    await tick();
    http.expectOne((r) => modelOf(r) === 'hormachuelos/a').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await tick();
    http.expectOne((r) => modelOf(r) === 'hormachuelos/b').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await tick();
    const next = http.match(() => true);
    expect(next.map((r) => modelOf(r.request))).toEqual(['dva/c']);
    next[0].flush({ choices: [{ message: { content: 'OK' } }] });
    expect((await answer).model).toBe('dva/c');
  });

  it('treats "model not available" from the free AI as a model problem, not a wrong key', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['hormachuelos/gone', 'dva/c']);
    providers.setHealth([{ providerId: id, model: 'hormachuelos/gone', ok: true, latency: 1 }]);
    const ai = TestBed.inject(AiService);
    const answer = ai.chat([{ role: 'user', content: 'hi' }]);
    await tick();
    http
      .expectOne((r) => modelOf(r) === 'hormachuelos/gone')
      .flush({ error: { message: '[403]: This model is not available on your account' } }, { status: 403, statusText: 'Forbidden' });
    await tick();
    http.expectOne((r) => modelOf(r) === 'dva/c').flush({ choices: [{ message: { content: 'OK' } }] });
    expect((await answer).model).toBe('dva/c');
  });
});

describe('AiService checks every model in the background', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  const modelOf = (r: { body: unknown }) => (r.body as { model: string }).model;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('marks every model that answers as working and the rest as failed', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['dva/a', 'cxa/b', 'zc/c']);
    const ai = TestBed.inject(AiService);
    const done = ai.sweep(true);
    for (let round = 0; round < 5; round++) {
      await tick();
      for (const req of http.match((r) => r.url.endsWith('/chat/completions'))) {
        const m = modelOf(req.request);
        if (m === 'cxa/b') {
          req.flush({}, { status: 500, statusText: 'Server error' });
        } else {
          req.flush({ choices: [{ message: { content: 'OK' } }] });
        }
      }
    }
    await done;
    const ok = providers.health().filter((h) => h.ok).map((h) => h.model).sort();
    expect(ok).toEqual(['dva/a', 'zc/c']);
    expect(providers.health().find((h) => h.model === 'cxa/b')?.ok).toBe(false);
    expect(ai.sweepDone()).toBe(3);
  });

  it('leaves a group alone after its server says it is busy three times', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['h/1', 'h/2', 'h/3', 'h/4', 'h/5', 'h/6']);
    const ai = TestBed.inject(AiService);
    const done = ai.sweep(true);
    let asked = 0;
    for (let round = 0; round < 8; round++) {
      await tick();
      for (const req of http.match((r) => r.url.endsWith('/chat/completions'))) {
        asked++;
        req.flush({}, { status: 429, statusText: 'Too Many Requests' });
      }
    }
    await done;
    expect(asked).toBeLessThanOrEqual(5);
    expect(asked).toBeLessThan(6);
    expect(ai.sweepDone()).toBe(6);
  });

  it('skips a group whose first three models all fail but keeps a group that works', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setCatalog(id, ['dva/1', 'dva/2', 'dva/3', 'dva/4', 'dva/5', 'dva/6', 'dva/7', 'gc/1', 'gc/2']);
    const ai = TestBed.inject(AiService);
    const done = ai.sweep(true);
    const asked: string[] = [];
    for (let round = 0; round < 10; round++) {
      await tick();
      for (const req of http.match((r) => r.url.endsWith('/chat/completions'))) {
        const m = modelOf(req.request);
        asked.push(m);
        if (m.startsWith('dva/')) {
          req.flush({}, { status: 503, statusText: 'Not configured' });
        } else {
          req.flush({ choices: [{ message: { content: 'OK' } }] });
        }
      }
    }
    await done;
    expect(asked.filter((m) => m.startsWith('dva/')).length).toBeLessThan(7);
    expect(providers.health().filter((h) => h.ok).map((h) => h.model).sort()).toEqual(['gc/1', 'gc/2']);
    expect(ai.sweepDone()).toBe(9);
  });
});

