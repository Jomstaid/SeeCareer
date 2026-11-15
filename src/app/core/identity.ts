export const appName = 'SeeCareer AI';

export const identityAnswer =
  "I'm **SeeCareer AI**, the career assistant inside the SeeCareer app. I was made by Group 2 (BSIT 3E, NEUST) " +
  'for our Mobile Application Development project and I run on free AI models.\n\n' +
  'I can help you find jobs, check and design your resume, write cover letters, find the skills you are missing and practice interviews. What do you want to work on?';

const askWho =
  /\b(who|what)\s+(are|r)\s+(you|u)\b|\bwho\s+(made|created|built|developed|trained|owns)\s+(you|u)\b|\bwhat\s+(ai|model|llm|bot)\s+(are|is)\b|\bwhich\s+(ai|model|llm)\b|\bare\s+(you|u)\s+(chatgpt|claude|gemini|gpt|grok|deepseek|an?\s+ai|a\s+bot|human|real)\b|\byour\s+name\b|\bsino\s+ka\b|\bano\s+ka\b|\bwhat\s+(model|llm|ai)\s+(do|did)\s+(you|u)\s+use\b|\byour\s+(model|llm)\b|\bwhat\s+powers\s+(you|u)\b|\bpowered\s+by\s+what\b|\bare\s+(you|u)\s+(alive|sentient|conscious|a\s+person|a\s+robot|openai|anthropic|google)\b|\bikaw\s+ba\s+(si\s+)?(chat\s?gpt|claude|gemini|gpt|grok|ai|robot|tao)\b|\bsino\s+(ang\s+)?(gumawa|nagawa|gawa)\b|\bgawa\s+ka\s+ng\s+sino\b|\bano\s+(ang\s+)?pangalan\s+mo\b/i;

export function asksWhoYouAre(text: string): boolean {
  const t = (text ?? '').trim();
  return t.length > 0 && t.length <= 80 && askWho.test(t);
}

const models = String.raw`(?:Claude|ChatGPT|GPT[\s.]?\d[\w.]*|GPT|Gemini|Grok|DeepSeek|Kimi|Qwen|Llama|Mistral|MiniMax|GLM|Copilot|Bard)`;
const versions = String.raw`(?:\s+(?:Sonnet|Opus|Haiku|Fable|Pro|Flash|Ultra|Turbo|Mini|Max|\d[\w.]*))*`;
const companies = String.raw`(?:Anthropic|OpenAI|Google(?:\s+DeepMind)?|DeepMind|xAI|DeepSeek|Moonshot(?:\s+AI)?|Alibaba(?:\s+Cloud)?|Meta|Mistral(?:\s+AI)?|Zhipu(?:\s+AI)?|MiniMax|Microsoft)`;

const selfIntro = new RegExp(
  String.raw`\b(I['’]m|I\s+am|my\s+name\s+is|this\s+is)\s+(?:an?\s+)?(?:AI\s+)?(?:assistant\s+)?(?:called\s+|named\s+)?${models}${versions}` +
    String.raw`(?:\s*(?:,|\(|-)?\s*(?:an?\s+)?(?:AI(?:\s+(?:assistant|model))?|large\s+language\s+model|language\s+model|assistant)?\s*(?:,\s*)?(?:made|created|built|developed|trained)?\s*(?:by|from)\s+${companies}\)?)?`,
  'gi',
);
const madeBy = new RegExp(String.raw`\b(made|created|built|developed|trained)\s+(by|at)\s+${companies}\b`, 'gi');
const fromCompany = new RegExp(String.raw`\b(an?\s+AI(?:\s+(?:assistant|model))?)\s+from\s+${companies}\b`, 'gi');

export function cleanIdentity(text: string): string {
  if (!text) {
    return text;
  }
  return text
    .replace(selfIntro, (whole: string, lead: string) => `${/^my/i.test(lead) ? 'My name is' : /^this/i.test(lead) ? 'This is' : lead} ${appName}`)
    .replace(madeBy, '$1 by Group 2 for the SeeCareer app')
    .replace(fromCompany, '$1 made for SeeCareer');
}

const canDo =
  "Here's what I can do for you as **SeeCareer AI**:\n\n" +
  '- **Find jobs**: tell me the role and place (like "web developer in Manila") and I search real job boards with Apply links.\n' +
  '- **Resume**: upload your resume and I check it, improve it and give it back as a designed PDF or Word file.\n' +
  '- **Match**: I compare your resume with a job and show how well you fit.\n' +
  '- **Apply**: I write a cover letter or application email for a job.\n' +
  '- **Skills gap**: I show the skills you still need and how to learn them.\n' +
  '- **Interview**: I give you practice questions and check your answers.\n\n' +
  'What do you want to start with?';

const freeAnswer =
  'Yes, **SeeCareer AI is free**. You do not need an account, a login or an API key. I run on free AI models through our own small server, ' +
  'so nothing is paid by you. Sometimes the free models are busy; if that happens, just wait a minute and try again.';

const privacyAnswer =
  'Your data stays with you. SeeCareer has **no account and no login**, and your resume, chats and settings are saved **only on your device**. ' +
  'When you send a message, the text goes to the AI to make the answer, and that is all. You can export or clear your chats anytime in Settings.';

const howAnswer =
  "Here's how I work: when you send a message, the SeeCareer app sends it to our small server, and the server passes it to a free AI model. " +
  'The app keeps a list of the smart models that are working right now. If one model is slow or stops answering, the next one answers for you, ' +
  'so you still get a reply. For jobs, the app searches real job boards (like Himalayas) and I explain the results.';

const whole = (core: string) =>
  new RegExp(String.raw`^\W*(?:(?:hi|hey|hello|so|ok|okay|ai|seecareer(?:\s+ai)?)\W+)?(?:${core})(?:\s+(?:for\s+me|here|exactly|po|ba|talaga))*\W*$`, 'i');

const aboutQuestions: { test: RegExp; answer: string }[] = [
  {
    test: whole(String.raw`what\s+can\s+(?:you|u)\s+do|what\s+do\s+(?:you|u)\s+do|how\s+can\s+(?:you|u)\s+help(?:\s+me)?|what\s+are\s+(?:you|u)\s+for|ano\s+(?:ang\s+)?(?:kaya|pwede|magagawa)\s+mo|help`),
    answer: canDo,
  },
  {
    test: whole(String.raw`(?:are\s+(?:you|u)|is\s+(?:this|it|the\s+(?:ai|app)|seecareer))\s+free|do\s+i\s+(?:need\s+to\s+|have\s+to\s+)?pay|libre\s+(?:ka|ba|lang)|magkano`),
    answer: freeAnswer,
  },
  {
    test: whole(String.raw`do\s+(?:you|u)\s+(?:save|store|keep|share|sell)\s+my\s+(?:data|info\w*|resume|chats?|files?)|is\s+my\s+(?:data|resume|info\w*|chat)\s+(?:safe|private|saved)|is\s+(?:this|it)\s+(?:safe|private)|safe\s+ba\s+(?:dito|ito)`),
    answer: privacyAnswer,
  },
  {
    test: whole(String.raw`how\s+do\s+(?:you|u)\s+work|how\s+does\s+(?:this|the|seecareer)\s*(?:ai|app)?\s*work|paano\s+ka\s+gumagana`),
    answer: howAnswer,
  },
];

export function aboutAssistantAnswer(text: string): string | null {
  const t = (text ?? '').trim();
  if (!t || t.length > 90) {
    return null;
  }
  return aboutQuestions.find((q) => q.test.test(t))?.answer ?? null;
}
