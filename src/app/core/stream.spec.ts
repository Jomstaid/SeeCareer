import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AiService, readStreamText } from './ai.service';
import { ProviderService } from './provider.service';

const sse = (...parts: string[]) =>
  parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';

describe('readStreamText', () => {
  it('joins the pieces of a streamed answer', () => {
    expect(readStreamText(sse('Hel', 'lo ', 'there'))).toEqual({ text: 'Hello there', done: true });
  });

  it('skips a piece that is only half received', () => {
    const raw = sse('Hi') + 'data: {"choices":[{"delta":{"content":"par';
    expect(readStreamText(raw).text).toBe('Hi');
  });

  it('reads a normal answer when the server does not stream', () => {
    expect(readStreamText(JSON.stringify({ choices: [{ message: { content: 'Whole answer' } }] })).text).toBe('Whole answer');
  });
});

describe('AiService streams the answer', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const answer = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': status === 200 ? 'text/event-stream' : 'application/json' } });

  it('shows the words as they come and moves to the next model when one fails', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setHealth([
      { providerId: id, model: 'zc/broken', ok: true, latency: 0.5 },
      { providerId: id, model: 'gc/good', ok: true, latency: 2 },
    ]);
    const asked: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      asked.push(model);
      return model === 'gc/good' ? answer(sse('Hello ', 'from SeeCareer AI')) : answer('{"error":{"message":"down"}}', 502);
    }) as typeof fetch;
    const seen: string[] = [];
    const ai = TestBed.inject(AiService);
    const result = await ai.chat([{ role: 'user', content: 'hi' }], 800, { onText: (t) => seen.push(t) });
    expect(result.content).toBe('Hello from SeeCareer AI');
    expect(result.model).toBe('gc/good');
    expect(seen.at(-1)).toBe('Hello from SeeCareer AI');
    expect(asked).toContain('zc/broken');
    expect(providers.health().find((h) => h.model === 'zc/broken')?.ok).toBe(false);
  });

  it('stops when the user presses stop', async () => {
    const providers = TestBed.inject(ProviderService);
    const id = providers.providers()[0].id;
    providers.setHealth([{ providerId: id, model: 'gc/slow', ok: true, latency: 1 }]);
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const ai = TestBed.inject(AiService);
    const run = ai.chat([{ role: 'user', content: 'hi' }], 800, { onText: () => undefined });
    await new Promise((r) => setTimeout(r, 10));
    ai.cancelAll();
    await expect(run).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
