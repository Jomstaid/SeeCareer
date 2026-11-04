import { TestBed } from '@angular/core/testing';

import { DEFAULT_FREE_AI } from './defaults';
import { ProviderService } from './provider.service';

describe('ProviderService', () => {
  beforeEach(() => localStorage.clear());

  it('adds the built-in free provider on first launch, without a key in the source code', () => {
    const service = TestBed.inject(ProviderService);
    const first = service.providers()[0];
    expect(first.preset).toBe('free');
    expect(first.name).toBe(DEFAULT_FREE_AI.name);
    expect(DEFAULT_FREE_AI.apiKey).toBe('');
  });

  it('moves a provider saved by an older version onto the built-in preset (matched by its address)', () => {
    localStorage.setItem(
      'seecareer.providers',
      JSON.stringify([{ id: 'a1', name: 'Old name', preset: 'legacy', baseUrl: DEFAULT_FREE_AI.baseUrl + '/', apiKey: 'k-12345678', model: '', enabled: true }]),
    );
    const service = TestBed.inject(ProviderService);
    const p = service.providers()[0];
    expect(p.preset).toBe('free');
    expect(p.name).toBe(DEFAULT_FREE_AI.name);
    expect(p.apiKey).toBe('k-12345678'); // the user's key is kept
  });

  it('leaves other providers alone', () => {
    localStorage.setItem(
      'seecareer.providers',
      JSON.stringify([{ id: 'b2', name: 'My Groq', preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_12345678', model: '', enabled: true }]),
    );
    const service = TestBed.inject(ProviderService);
    expect(service.providers()[0].preset).toBe('groq');
    expect(service.providers()[0].name).toBe('My Groq');
  });
});
