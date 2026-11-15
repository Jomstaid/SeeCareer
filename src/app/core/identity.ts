// The assistant is always "SeeCareer AI".
// The free models behind it sometimes say their own name (like "I'm Claude from Anthropic"),
// so we answer identity questions ourselves and clean the answers we get back.

export const appName = 'SeeCareer AI';

export const identityAnswer =
  "I'm **SeeCareer AI**, the career assistant inside the SeeCareer app. I was made by Group 2 (BSIT 3E, NEUST) " +
  'for our Mobile Application Development project and I run on free AI models.\n\n' +
  'I can help you find jobs, check and design your resume, write cover letters, find the skills you are missing and practice interviews. What do you want to work on?';

// "who are you", "what model are you", "are you chatgpt", "who made you", "ano ka"
const askWho =
  /\b(who|what)\s+(are|r)\s+(you|u)\b|\bwho\s+(made|created|built|developed|trained|owns)\s+(you|u)\b|\bwhat\s+(ai|model|llm|bot)\s+(are|is)\b|\bwhich\s+(ai|model|llm)\b|\bare\s+(you|u)\s+(chatgpt|claude|gemini|gpt|grok|deepseek|an?\s+ai|a\s+bot|human|real)\b|\byour\s+name\b|\bsino\s+ka\b|\bano\s+ka\b/i;

// a short question about the assistant itself (a long message that happens to contain "who are you" is a real question)
export function asksWhoYouAre(text: string): boolean {
  const t = (text ?? '').trim();
  return t.length > 0 && t.length <= 80 && askWho.test(t);
}

const models = String.raw`(?:Claude|ChatGPT|GPT[\s.]?\d[\w.]*|GPT|Gemini|Grok|DeepSeek|Kimi|Qwen|Llama|Mistral|MiniMax|GLM|Copilot|Bard)`;
const versions = String.raw`(?:\s+(?:Sonnet|Opus|Haiku|Fable|Pro|Flash|Ultra|Turbo|Mini|Max|\d[\w.]*))*`;
const companies = String.raw`(?:Anthropic|OpenAI|Google(?:\s+DeepMind)?|DeepMind|xAI|DeepSeek|Moonshot(?:\s+AI)?|Alibaba(?:\s+Cloud)?|Meta|Mistral(?:\s+AI)?|Zhipu(?:\s+AI)?|MiniMax|Microsoft)`;

// "I'm Claude Sonnet 4.6 from Anthropic", "I am ChatGPT, made by OpenAI", "My name is Gemini"
const selfIntro = new RegExp(
  String.raw`\b(I['’]m|I\s+am|my\s+name\s+is|this\s+is)\s+(?:an?\s+)?(?:AI\s+)?(?:assistant\s+)?(?:called\s+|named\s+)?${models}${versions}` +
    String.raw`(?:\s*(?:,|\(|-)?\s*(?:an?\s+)?(?:AI(?:\s+(?:assistant|model))?|large\s+language\s+model|language\s+model|assistant)?\s*(?:,\s*)?(?:made|created|built|developed|trained)?\s*(?:by|from)\s+${companies}\)?)?`,
  'gi',
);
// "made by Anthropic", "trained by OpenAI", "an AI from Google"
const madeBy = new RegExp(String.raw`\b(made|created|built|developed|trained)\s+(by|at)\s+${companies}\b`, 'gi');
const fromCompany = new RegExp(String.raw`\b(an?\s+AI(?:\s+(?:assistant|model))?)\s+from\s+${companies}\b`, 'gi');

// Takes out the model's own name when it introduces itself, so the user always talks to SeeCareer AI.
export function cleanIdentity(text: string): string {
  if (!text) {
    return text;
  }
  return text
    .replace(selfIntro, (whole: string, lead: string) => `${/^my/i.test(lead) ? 'My name is' : /^this/i.test(lead) ? 'This is' : lead} ${appName}`)
    .replace(madeBy, '$1 by Group 2 for the SeeCareer app')
    .replace(fromCompany, '$1 made for SeeCareer');
}
