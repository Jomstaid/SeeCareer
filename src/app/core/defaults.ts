import { AppSettings, ProviderPreset } from './models';

/**
 * The free AI gateway used by this project (OpenAI-compatible).
 * It is added to Settings automatically the first time the app opens.
 *
 * The API key is NOT stored in the source code. Put it in src/assets/local-config.json
 * (copy local-config.example.json; that file is git-ignored) or paste it in Settings > AI Providers.
 */
export const DEFAULT_FREE_AI = {
  name: 'Free AI',
  baseUrl: 'http://194.156.90.214:20128/v1',
  apiKey: '',
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: 'free',
    label: 'Free AI (built-in)',
    baseUrl: DEFAULT_FREE_AI.baseUrl,
    note: 'Free gateway that routes to many models. Already set up for you.',
    keyHint: 'Starts with sk-',
    signup: '',
    preferred: [
      'antigravity/claude-sonnet-4-6',
      'antigravity/gemini-3.8-flash-high',
      'antigravity/gemini-3-flash',
      'antigravity/claude-opus-4-6-thinking',
      'antigravity/gemini-3.8-flash-medium',
      'antigravity/gemini-3.5-flash-lite',
      'antigravity/gemini-3.1-flash-lite',
      'antigravity/gemini-3.8-flash-low',
      'auto/best-fast',
    ],
  },
  {
    key: 'groq',
    label: 'Groq (free key)',
    baseUrl: 'https://api.groq.com/openai/v1',
    note: 'Very fast, generous free plan.',
    keyHint: 'Starts with gsk_',
    signup: 'https://console.groq.com/keys',
    preferred: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'],
  },
  {
    key: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    note: 'Many free models (names ending in :free).',
    keyHint: 'Starts with sk-or-',
    signup: 'https://openrouter.ai/keys',
    preferred: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free'],
  },
  {
    key: 'gemini',
    label: 'Google Gemini (free key)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    note: 'Free tier from Google AI Studio.',
    keyHint: 'Starts with AIza',
    signup: 'https://aistudio.google.com/apikey',
    preferred: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    key: 'custom',
    label: 'Custom (any OpenAI-compatible)',
    baseUrl: '',
    note: 'Any server that offers /v1/chat/completions.',
    keyHint: 'Whatever your provider gave you',
    signup: '',
    preferred: [],
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  maxTokens: 800,
  saveHistory: true,
  fontSize: 'medium',
  customInstructions: '',
};

/** Words in a model id that mean it is not a text-chat model. */
export const NOT_CHAT_MODELS = ['embed', 'tts', 'whisper', 'image', 'imagen', 'rerank', 'moderation', 'guard', 'dall-e', 'video', 'audio', 'transcribe'];

/** How many models are health-checked per provider. */
export const MAX_SCAN_PER_PROVIDER = 8;

export const SUGGESTIONS: string[] = [
  'What careers fit someone who likes design and coding?',
  'Make me a 3-month plan to become a junior web developer.',
  'How do I write a strong resume with no work experience?',
  'Give me 5 interview questions for a software job and how to answer them.',
];

export const SYSTEM_PROMPT =
  'You are SeeCareer AI, an expert career coach, recruiter and resume writer for students, fresh graduates and job seekers ' +
  '(many are from the Philippines; use PHP or local examples when it helps, but do not assume). ' +
  'How you work:\n' +
  '- Be specific, practical and honest. Prefer concrete steps, examples and numbers over generic advice.\n' +
  "- Use ONLY facts from the user's resume or messages. Never invent employers, degrees, dates or skills. If information is missing, ask one short question or use a [placeholder].\n" +
  '- Think step by step before answering hard questions, then give a clear, well-structured answer (short headings, bullets, bold key points).\n' +
  '- Never promise that someone will be hired. When you estimate chances or scores, explain the reasoning briefly.\n' +
  '- If a request is not about careers, jobs, studying or work, answer briefly and steer back to how you can help with their career.\n' +
  "- Match the user's language (English, Filipino/Tagalog or mixed). Keep answers focused; no filler.";
