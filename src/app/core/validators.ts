/** Input validation used by the Settings form and the chat box. */

export interface ProviderInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type FieldErrors = Partial<Record<keyof ProviderInput, string>>;

export interface ProviderCheck {
  valid: boolean;
  errors: FieldErrors;
  /** Cleaned-up values (trimmed, no trailing slash). */
  clean: ProviderInput;
}

export const MAX_MESSAGE_LENGTH = 4000;
export const MIN_RESUME_LENGTH = 50;
export const MAX_RESUME_LENGTH = 12000;
export const MAX_INSTRUCTIONS_LENGTH = 600;

/** Returns an error message, or '' when the resume text is fine to analyze. */
export function validateResume(text: string): string {
  const value = (text ?? '').trim();
  if (value.length < MIN_RESUME_LENGTH) {
    return `Add more detail: at least ${MIN_RESUME_LENGTH} characters (you have ${value.length}).`;
  }
  if (value.length > MAX_RESUME_LENGTH) {
    return `Resume is too long (${value.length}/${MAX_RESUME_LENGTH} characters).`;
  }
  return '';
}

export function validateProvider(
  input: ProviderInput,
  existingNames: string[] = [],
  keyRequired = true,
): ProviderCheck {
  const clean: ProviderInput = {
    name: (input.name ?? '').trim(),
    baseUrl: (input.baseUrl ?? '').trim().replace(/\/+$/, ''),
    apiKey: (input.apiKey ?? '').trim(),
    model: (input.model ?? '').trim(),
  };
  const errors: FieldErrors = {};

  if (clean.name.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (clean.name.length > 40) {
    errors.name = 'Name must be 40 characters or fewer.';
  } else if (existingNames.some((n) => n.toLowerCase() === clean.name.toLowerCase())) {
    errors.name = 'A provider with this name already exists.';
  }

  if (!clean.baseUrl) {
    errors.baseUrl = 'Base URL is required.';
  } else if (!isValidHttpUrl(clean.baseUrl)) {
    errors.baseUrl = 'Enter a valid URL that starts with http:// or https://';
  }

  if (!clean.apiKey) {
    if (keyRequired) {
      errors.apiKey = 'API key is required.';
    }
  } else if (/\s/.test(clean.apiKey)) {
    errors.apiKey = 'API key cannot contain spaces.';
  } else if (clean.apiKey.length < 8) {
    errors.apiKey = 'API key looks too short. Copy the whole key.';
  }

  if (clean.model) {
    if (/\s/.test(clean.model)) {
      errors.model = 'Model name cannot contain spaces.';
    } else if (clean.model.length > 100) {
      errors.model = 'Model name is too long.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, clean };
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

/** Returns an error message, or '' when the chat text is fine to send. */
export function validateMessage(text: string): string {
  const value = (text ?? '').trim();
  if (!value) {
    return 'Type a message first.';
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return `Message is too long (${value.length}/${MAX_MESSAGE_LENGTH} characters).`;
  }
  return '';
}
