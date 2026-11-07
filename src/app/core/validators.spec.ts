import { isValidHttpUrl, validateMessage, validateProvider } from './validators';

describe('validateProvider', () => {
  const good = { name: 'My AI', baseUrl: 'https://host.com/v1/', apiKey: 'sk-12345678', model: '' };

  it('accepts valid input and cleans the URL', () => {
    const r = validateProvider(good);
    expect(r.valid).toBe(true);
    expect(r.clean.baseUrl).toBe('https://host.com/v1');
  });

  it('rejects a short name, bad URL and missing key', () => {
    const r = validateProvider({ name: 'A', baseUrl: 'host.com', apiKey: '', model: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.baseUrl).toBeTruthy();
    expect(r.errors.apiKey).toBeTruthy();
  });

  it('rejects keys with spaces, short keys and models with spaces', () => {
    expect(validateProvider({ ...good, apiKey: 'sk 12345678' }).errors.apiKey).toBeTruthy();
    expect(validateProvider({ ...good, apiKey: 'abc' }).errors.apiKey).toBeTruthy();
    expect(validateProvider({ ...good, model: 'gpt 4' }).errors.model).toBeTruthy();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    expect(validateProvider(good, ['my ai']).errors.name).toBeTruthy();
  });

  it('allows an empty key when it is not required', () => {
    expect(validateProvider({ ...good, apiKey: '' }, [], false).valid).toBe(true);
  });
});

describe('isValidHttpUrl', () => {
  it('checks the protocol', () => {
    expect(isValidHttpUrl('http://localhost:8080/v1')).toBe(true);
    expect(isValidHttpUrl('ftp://x.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
  });
});

describe('validateMessage', () => {
  it('rejects empty and too long text', () => {
    expect(validateMessage('   ')).toBeTruthy();
    expect(validateMessage('a'.repeat(4001))).toBeTruthy();
    expect(validateMessage('hello')).toBe('');
  });
});

import { validateResume } from "./validators";

describe("validateResume", () => {
  it("needs enough text but not too much", () => {
    expect(validateResume("too short")).toBeTruthy();
    expect(validateResume("x".repeat(60))).toBe("");
    expect(validateResume("x".repeat(12001))).toBeTruthy();
  });
});
