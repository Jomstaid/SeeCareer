import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AiService } from './ai.service';
import { ProviderService } from './provider.service';

describe('AiService request headers', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function pingFirst(setup?: (providers: ProviderService) => void) {
    const providers = TestBed.inject(ProviderService);
    setup?.(providers);
    const ai = TestBed.inject(AiService);
    const provider = providers.providers()[0];
    const result = ai.ping(provider, 'antigravity/gemini-3-flash');
    const req = http.expectOne((r) => r.url.endsWith('/chat/completions'));
    req.flush({ choices: [{ message: { content: 'OK' } }] });
    await result;
    return req.request;
  }

  it('the built-in free AI carries no key and no token', async () => {
    const request = await pingFirst();
    expect(request.url.startsWith('https://api.jomstaid.com/v1/')).toBe(true);
    expect(request.headers.get('Authorization')).toBeNull();
    expect(request.headers.get('X-App-Token')).toBeNull();
  });

  it('a provider the user added sends its own key as a bearer token', async () => {
    const request = await pingFirst((p) => {
      p.save({ name: 'Mine', preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_12345678', model: '', enabled: true });
      p.providers.set(p.providers().filter((x) => x.preset === 'groq')); // only the user's provider is left
    });
    expect(request.url.startsWith('https://api.groq.com/')).toBe(true);
    expect(request.headers.get('Authorization')).toBe('Bearer gsk_12345678');
    expect(request.headers.get('X-App-Token')).toBeNull();
  });

  it('never stores a key for the built-in provider', () => {
    const providers = TestBed.inject(ProviderService);
    const builtin = providers.providers().find((p) => p.builtin)!;
    providers.save({ ...builtin, apiKey: 'sk-should-not-stick' });
    expect(providers.providers().find((p) => p.builtin)!.apiKey).toBe('');
    expect(localStorage.getItem('seecareer.providers') ?? '').not.toContain('sk-should-not-stick');
  });
});
