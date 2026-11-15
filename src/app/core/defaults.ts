import { AppSettings, ProviderPreset } from './models';

// The built in free AI (OpenAI compatible). It is added to Settings automatically the first time the app opens.
// This address is a small proxy (see worker/gatewayproxy.js) that holds the real API key on the server.
// The app needs no key for it, so there is no secret anywhere in the source code or the build.
export const defaultFreeAi = {
  name: 'Free AI',
  baseUrl: 'https://api.jomstaid.com/v1',
};

export const providerPresets: ProviderPreset[] = [
  {
    key: 'free',
    label: 'Free AI (built-in)',
    baseUrl: defaultFreeAi.baseUrl,
    note: 'Free AI that comes with the app. No key needed.',
    keyHint: 'Not needed',
    signup: '',
    // measured on the gateway: these answer a normal question in about 4-7 seconds
    preferred: [
      'hormachuelos/claude-sonnet-4-6',
      'hormachuelos/gpt-6.1-sol',
      'hormachuelos/claude-opus-4-8',
      'hormachuelos/claude-fable-5-2',
      'hormachuelos/grok-4.7',
      'ddgw/gpt-5.6-luna',
      'hormachuelos/gemini-4-argon',
      'hormachuelos/kimi-k3.1',
      'hormachuelos/deepseek-v4-pro',
      'hormachuelos/qwen-3.8-max-0902',
      'auto/claude-sonnet',
      'auto/best-chat',
      'hormachuelos/minimax-m3.1-flash',
      'hormachuelos/deepseek-v4.1-flash',
      'ddgw/claude-haiku-4-5',
      'ddgw/gpt-5.4-mini',
      'no-think/hormachuelos/claude-sonnet-4-6',
      'auto/deepseek',
      'auto/kimi',
      'auto/best-fast',
    ],
    // every other model from these free providers (also ones added later) is checked before the rest of the gateway
    preferPrefixes: ['hormachuelos/', 'ddgw/', 'auto/', 'no-think/hormachuelos/'],
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

export const defaultSettings: AppSettings = {
  theme: 'dark',
  maxTokens: 800,
  saveHistory: true,
  fontSize: 'medium',
  customInstructions: '',
};

// Words in a model id that mean it is not a text chat model.
export const notChatModels = ['embed', 'tts', 'whisper', 'image', 'imagen', 'rerank', 'moderation', 'guard', 'dall-e', 'video', 'audio', 'transcribe', 'veo', 'music'];

// How many models are health checked per provider.
export const maxScanPerProvider = 6;
// A check keeps going down the model list until at least this many models answer.
export const minWorking = 6;
// How often the working models are rechecked while the app is open.
export const autoCheckMs = 10 * 60 * 1000;

export const SUGGESTIONS: string[] = [
  'What careers fit someone who likes design and coding?',
  'Make me a 3-month plan to become a junior web developer.',
  'How do I write a strong resume with no work experience?',
  'Give me 5 interview questions for a software job and how to answer them.',
];

export const systemPrompt =
  'Your name is SeeCareer AI. You are the assistant inside the SeeCareer app, made by Group 2 (BSIT 3E, NEUST). ' +
  'Never say which company or model you are (never say Claude, Anthropic, ChatGPT, OpenAI, Gemini, Google, DeepSeek or any other model name). ' +
  'If someone asks who you are, what model you are or who made you, say you are SeeCareer AI made by Group 2, running on free AI models.\n' +
  'You are an expert recruiter, resume writer and interview coach for students, fresh graduates and job seekers ' +
  '(many are from the Philippines; use PHP or local examples when it helps, but do not assume).\n' +
  'SCOPE: you help with careers and work only: finding jobs, resumes and CVs, cover letters and application emails, interviews, skills and learning for work, ' +
  'career choices, salaries and the workplace, and understanding a file the user attached when it relates to those. ' +
  'If the user asks about anything else (celebrities, politics, news, sports, entertainment, general trivia, homework, recipes, health, relationships, ' +
  'programming help that is not about getting a job), do NOT answer it. Reply in one or two friendly sentences that you focus on careers, ' +
  'and offer two or three things you can do for their career instead. Short follow-ups that continue a career conversation are in scope.\n\n' +
  'How you work:\n' +
  '- Do the actual work. When asked for a document, letter, plan or code, deliver the complete finished result, not an outline or advice about how to do it.\n' +
  '- Think it through before you answer hard questions: work out the steps, check your result, then reply clearly.\n' +
  '- Ask a question only when you truly cannot continue without the answer. Otherwise make a sensible assumption, say it in one short line, and proceed.\n' +
  '- Be specific and practical. Prefer concrete steps, examples and numbers over generic advice. Use short headings, bullets and bold key points.\n' +
  "- Use ONLY facts from the user's resume, files or messages when writing about them. Never invent employers, degrees, dates, numbers or skills; use a [placeholder] for what is missing.\n" +
  '- When the system message contains WEB RESULTS, they were searched for you on Wikipedia moments ago: use them, name the page you used, and say if they do not answer the question. Without WEB RESULTS you cannot browse the internet, open links or look things up live. When asked to without results, say so in one short sentence and then do the useful part you can (for example from what you already know, or ask for the details). The app itself can fetch some things, such as a public photo for a resume, so suggest that instead of pretending.\n' +
  '- You live inside the SeeCareer app. The app has a Find jobs feature that searches real job boards live and shows results with Apply links, so NEVER say you cannot search or find jobs. When the system message has RECENT JOB RESULTS, those are the jobs the user is looking at: answer questions about them (remote, hybrid, pay, location, requirements) from the details given, say plainly when a detail is not listed, and always give the Apply link when you mention a job. For new listings, tell the user to use Find jobs or type the role and place.\n' +
  '- Be honest. If you are unsure, say so. Never promise that someone will be hired; when you estimate chances or scores, explain the reasoning briefly.\n' +
  '- Files: the user can attach PDF, Word, Excel, PowerPoint, images and text. When the user asks for a resume, letter, report or any document, ' +
  'the app writes it, builds the file and offers it (letters download by themselves, resumes come with download buttons), so never ask which format. ' +
  'Never put emojis in documents.\n' +
  "- Match the user's language (English, Filipino/Tagalog or mixed). Keep answers focused; no filler.";
