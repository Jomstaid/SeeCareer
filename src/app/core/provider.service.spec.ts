import { TestBed } from '@angular/core/testing';

import { DEFAULT_FREE_AI } from './defaults';
import { ProviderService } from './provider.service';

const STORE = 'seecareer.providers';

describe('ProviderService (built-in provider needs no key)', () => {
  beforeEach(() => localStorage.clear());

  it('adds the built-in provider on first launch, with no key anywhere', () => {
    const first = TestBed.inject(ProviderService).providers()[0];
    expect(first.builtin).toBe(true);
    expect(first.preset).toBe('free');
    expect(first.baseUrl).toBe('https://api.jomstaid.com/v1');
    expect(first.apiKey).toBe('');
    expect(Object.keys(DEFAULT_FREE_AI)).not.toContain('apiKey'); // nothing secret in the source code
  });

  it('never stores a key for the built-in provider and keeps its address locked', () => {
    const service = TestBed.inject(ProviderService);
    const p = service.providers()[0];
    service.save({ ...p, baseUrl: 'https://evil.example/v1', preset: 'custom', apiKey: 'typed-key-123456' });
    const after = service.providers()[0];
    expect(after.baseUrl).toBe(DEFAULT_FREE_AI.baseUrl);
    expect(after.apiKey).toBe('');
    expect(localStorage.getItem(STORE)).not.toContain('typed-key-123456');
  });

  it('turns a provider saved at the old bare-IP address into the built-in one and deletes its saved key', () => {
    localStorage.setItem(
      STORE,
      JSON.stringify([{ id: 'a1', name: 'Old name', preset: 'legacy', baseUrl: 'http://10.0.0.5:20128/v1', apiKey: 'old-secret-key-123', model: 'm1', enabled: false }]),
    );
    const p = TestBed.inject(ProviderService).providers()[0];
    expect(p.builtin).toBe(true);
    expect(p.baseUrl).toBe(DEFAULT_FREE_AI.baseUrl);
    expect(p.apiKey).toBe('');
    expect(p.model).toBe('m1'); // the user's model choice is kept
    expect(p.enabled).toBe(false); // and the on/off switch
    expect(localStorage.getItem(STORE)).not.toContain('old-secret-key-123'); // the old key is wiped from storage
  });

  it('wipes a key that an earlier version saved for the current address', () => {
    localStorage.setItem(
      STORE,
      JSON.stringify([{ id: 'a1', name: 'Free AI', preset: 'free', baseUrl: DEFAULT_FREE_AI.baseUrl, apiKey: 'saved-secret-key-1', model: '', enabled: true }]),
    );
    TestBed.inject(ProviderService);
    expect(localStorage.getItem(STORE)).not.toContain('saved-secret-key-1');
  });

  it("leaves a provider the user added with their own key alone", () => {
    localStorage.setItem(
      STORE,
      JSON.stringify([{ id: 'b2', name: 'My Groq', preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_12345678', model: '', enabled: true }]),
    );
    const p = TestBed.inject(ProviderService).providers()[0];
    expect(p.builtin).toBeFalsy();
    expect(p.preset).toBe('groq');
    expect(p.apiKey).toBe('gsk_12345678');
  });

  it('removes a provider together with its health results', () => {
    const service = TestBed.inject(ProviderService);
    const id = service.providers()[0].id;
    service.setHealth([{ providerId: id, model: 'm', ok: true, latency: 1 }]);
    service.remove(id);
    expect(service.providers().length).toBe(0);
    expect(service.health().length).toBe(0);
  });
});
