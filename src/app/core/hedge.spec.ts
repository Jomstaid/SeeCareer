import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AiService } from './ai.service';
import { ProviderService } from './provider.service';

// When one model hangs, the chat must not wait for it: the next model is asked too and the first answer wins.
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
    // 10 seconds without an answer: the next model is asked as well
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
    // no second batch was tried
    expect(http.match((r) => r.url.endsWith('/chat/completions')).length).toBe(0);
    expect(err.message).toMatch(/busy/i);
  });
});

// When every working model fails in the middle of a question, the app goes down the full list of models.
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
    // the backup model is now known to work
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
    // hormachuelos is busy, so its other models are not asked: the next group is
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
