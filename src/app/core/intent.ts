import { ExportFormat } from './models';
import { ACCENTS, ResumeTemplate } from './resumedata';

/** What the user is asking the app to produce. */
export interface Intent {
  /** resume = a designed resume; document = write a new document; convert = turn the last answer into a file. */
  kind: 'resume' | 'document' | 'convert';
  /** The file format, read from the message. PDF unless they say Word, text or Markdown. */
  format: ExportFormat;
  /** Design words found in the message ("minimal", "classic"...). */
  template?: ResumeTemplate;
  /** An accent colour found in the message, as a hex value. */
  accent?: string;
}

const QUESTION = /^\s*(how|what|why|when|where|which|who|can i|should i|do i|is it|are there|tips|advice|explain)\b/i;
const MAKE = /\b(create|make|build|generate|design|write|draft|prepare|compose|produce|give me|get me|do me|i need|i want|need a|want a|can you (make|create|build|write|design|do)|help me (make|create|build|write|design|with))\b/i;
const RESUME_MAKE = /\b(create|make|build|generate|design|write|draft|prepare|produce|need|want|give me|get me|do me|redo|redesign|remake|rewrite|revamp|update|polish|improve|enhance|fix|convert)\b/i;
const RESUME_NOUN = /\b(resume|r[eé]sum[eé]|cv|curriculum vitae)\b/i;
const NOT_CREATING = /\b(analy[sz]e|review|check|critique|score|feedback|proofread|what('s| is) wrong)\b/i;
const DOC_NOUN =
  /\b(cover letter|application letter|resignation letter|recommendation letter|letter|report|essay|proposal|agenda|schedule|checklist|template|contract|agreement|invoice|memo|minutes|outline|study guide|worksheet|certificate|portfolio|brochure|flyer|poster|handout|newsletter|lesson plan|meal plan|workout plan|budget|document)\b/i;
const FORMAT_WORD = /\b(pdf|word|docx?|ms word|microsoft word|txt|text file|plain text|markdown)\b/i;
const REFERS_BACK = /\b(this|that|it|above|previous|last (one|answer|reply|response)|the answer|the reply|these|those)\b/i;
const CONVERT_VERB = /\b(make|turn|convert|save|put|export|download|give|send|change|print)\b/i;

export function detectFormat(text: string): ExportFormat {
  if (/\b(word|docx?|ms word|microsoft word)\b/i.test(text)) {
    return 'docx';
  }
  if (/\b(txt|text file|plain text)\b/i.test(text)) {
    return 'txt';
  }
  if (/\b(markdown|\.md)\b/i.test(text)) {
    return 'md';
  }
  return 'pdf';
}

/** Design hints in the message, for example "a bold green resume" or "something elegant in burgundy". */
export function detectDesign(text: string): { template?: ResumeTemplate; accent?: string } {
  const out: { template?: ResumeTemplate; accent?: string } = {};
  const looks: [RegExp, ResumeTemplate][] = [
    [/\b(bold|dark (side|sidebar|column|theme|resume|design|layout)|dark mode|black sidebar|strong look|edgy)\b/i, 'bold'],
    [/\b(creative|artistic|colou?rful|playful|fun|eye.?catching|vibrant|stand out|standout|unique|magazine|portfolio style)\b/i, 'creative'],
    [/\b(executive|corporate|boardroom|authoritative|leadership)\b/i, 'executive'],
    [/\b(elegant|refined|luxur\w+|sophisticated|graceful|centou?red|centered|fine lines|fashion)\b/i, 'elegant'],
    [/\b(classic|traditional|formal|conservative|serif|old school|timeless)\b/i, 'classic'],
    [/\b(minimal\w*|clean|simple|airy|plain|understated|whitespace)\b/i, 'minimal'],
    [/\b(modern|sleek|contemporary|colou?r header|tech style)\b/i, 'modern'],
  ];
  for (const [re, key] of looks) {
    if (re.test(text)) {
      out.template = key;
      break;
    }
  }
  const colours: [RegExp, string][] = [
    [/\b(navy|dark blue|midnight)\b/i, 'Navy'],
    [/\bindigo\b/i, 'Indigo'],
    [/\b(teal|turquoise|aqua|cyan)\b/i, 'Teal'],
    [/\b(forest|dark green|emerald|olive)\b/i, 'Forest'],
    [/\b(burgundy|maroon|wine|crimson)\b/i, 'Burgundy'],
    [/\b(gold|golden|mustard|amber|bronze|brown)\b/i, 'Gold'],
    [/\b(black|charcoal|dark gr[ae]y|jet)\b/i, 'Charcoal'],
    [/\b(pink|rose|magenta)\b/i, 'Rose'],
    [/\b(blue|sky)\b/i, 'Blue'],
    [/\bgreen\b/i, 'Green'],
    [/\b(purple|violet|lavender)\b/i, 'Purple'],
    [/\bred\b/i, 'Red'],
    [/\b(slate|gr[ae]y|silver)\b/i, 'Slate'],
    [/\borange\b/i, 'Orange'],
  ];
  for (const [re, name] of colours) {
    if (re.test(text)) {
      out.accent = ACCENTS.find((x) => x.name === name)?.hex;
      break;
    }
  }
  if (!out.accent && out.template !== 'bold' && /\bdark\b/i.test(text)) {
    out.accent = ACCENTS.find((x) => x.name === 'Slate')?.hex;
  }
  return out;
}

/** The user wants another look but did not name one: "a different design", "make it look better", "something unique". */
export function wantsDifferentDesign(text: string): boolean {
  const t = text ?? '';
  return (
    /\b(different|another|other|new|fresh|unique|better|nicer|prettier|improve|redo|redesign|change)\b[^.!?]{0,30}\b(design|layout|look|style|template|theme)\b/i.test(t) ||
    /\b(design|layout|look|style|template|theme)\b[^.!?]{0,30}\b(different|another|better|nicer|unique|boring|same|plain|ugly)\b/i.test(t) ||
    /\bmake it (look )?(better|nicer|prettier|more (professional|unique|creative|modern|attractive|stylish|appealing))\b/i.test(t) ||
    /\b(too|looks?) (plain|boring|basic|same|simple|ugly)\b/i.test(t) ||
    /\bsomething else\b/i.test(t) ||
    // short follow-ups right after a resume: "different", "another one", "try again", "different again please"
    /^\s*(a |an )?(different|another|something (else|different)|try again|again|new one|change it)( one| design| look| layout| again| please| pls| one more)*\s*[.!]?\s*$/i.test(t)
  );
}

/**
 * Works out whether a chat message is a request for a file, so the app can make it and download it
 * straight away instead of chatting about it. Returns null for normal questions.
 * `hasPriorAnswer` says whether there is an earlier AI answer that "make this a PDF" could refer to.
 */
export function detectIntent(text: string, hasPriorAnswer = false): Intent | null {
  const t = (text ?? '').trim();
  if (t.length < 4 || t.startsWith('/') || QUESTION.test(t)) {
    return null;
  }
  const format = detectFormat(t);

  if (RESUME_NOUN.test(t) && RESUME_MAKE.test(t) && !(NOT_CREATING.test(t) && !MAKE.test(t))) {
    return { kind: 'resume', format, ...detectDesign(t) };
  }
  if (hasPriorAnswer && FORMAT_WORD.test(t) && REFERS_BACK.test(t) && CONVERT_VERB.test(t) && t.length < 120) {
    return { kind: 'convert', format };
  }
  // a format word alone ('make a pdf about dogs') counts; 'make this a pdf' with nothing to convert does not
  if (MAKE.test(t) && (DOC_NOUN.test(t) || (FORMAT_WORD.test(t) && !REFERS_BACK.test(t))) && !RESUME_NOUN.test(t)) {
    return { kind: 'document', format };
  }
  return null;
}

const JOB_WORDS =
  /\b(develop\w*|engineer\w*|design\w*|manage\w*|analy\w*|nurs\w*|teach\w*|assist\w*|special\w*|officer|account\w*|market\w*|sales|support|writ\w*|edit\w*|intern\w*|student\w*|graduat\w*|job\w*|position|role|compan\w*|school|resume|cv|word|pdf|docx?|work\w*|appl\w*|career|fresher|beginner\w*|experienc\w*|senior|junior|it|hr|ui|ux|bpo|call|center|virtual|data|software|web|mobile|content|social|media|customer|service|finance|health\w*|medical|legal|law\w*|free|fresh|entry|remote|abroad|overseas|office|college|part|full|time|template|simple|modern|classic|minimal)\b/i;
const NOT_NAMES = /^(me|my|myself|i|the|a|an|us|you|him|her|them|this|that|it)$/i;

/**
 * Who a resume is requested for when it is not the user: "create me a resume for Jahn Paul" gives "Jahn Paul";
 * "for duterte with image" gives "duterte"; "for my brother" gives "" (someone else, name unknown).
 * Returns null when the resume is for the user.
 */
export function personFromRequest(text: string): string | null {
  const t = text ?? '';
  if (/\bfor my (friend|brother|sister|mother|mom|mum|father|dad|wife|husband|cousin|classmate|colleague|boyfriend|girlfriend|son|daughter|uncle|aunt|neighbou?r|client|partner)\b/i.test(t)) {
    return '';
  }
  const m = /\bfor\s+((?:[A-Z][\p{L}'.-]+)(?:\s+[A-Z][\p{L}'.-]+){0,3})/u.exec(t);
  const name = m?.[1]?.trim();
  if (name && !NOT_NAMES.test(name) && !JOB_WORDS.test(name)) {
    return name;
  }
  // a name typed in a hurry, all lowercase: "for duterte with image"
  const low = /\bfor\s+((?:(?!(?:with|and|in|as|using|plus|pdf|word|docx|a|an|the|my|me|that|which|please)\b)[a-z][a-z'.-]{2,}\s*){1,3})/i.exec(t);
  const guess = low?.[1]?.trim();
  if (guess && !guess.split(/\s+/).some((w) => NOT_NAMES.test(w)) && !JOB_WORDS.test(guess)) {
    return guess;
  }
  return null;
}

const PHOTO_WORD = /\b(pic|pics|picture|pictures|photo|photos|image|selfie|portrait|face|avatar|headshot)\b/i;

/** "add picture", "put my photo": the user wants a photo on the resume. */
export function wantsPhotoAdded(text: string): boolean {
  return PHOTO_WORD.test(text) && /\b(add|put|include|insert|attach|use|set|change|replace|with|place)\b/i.test(text) && !wantsPhotoRemoved(text);
}

export function wantsPhotoRemoved(text: string): boolean {
  return PHOTO_WORD.test(text) && /\b(remove|delete|without|no|take out|get rid)\b/i.test(text);
}

const EDIT_VERB =
  /\b(add|remove|delete|change|replace|update|edit|shorter|longer|shorten|rewrite|fix|include|swap|move|reorder|rearrange|translate|fit|bigger|smaller|make it|make the|make my|turn it|more|less|use|put|set|without)\b/i;
const QUESTION_START = /^\s*(how|what|why|when|where|which|who|can you tell|explain|is |are |do |does |tell me)/i;

/** A short request to change the resume that was just made ("add picture", "make it red", "add skill Python"). */
export function isResumeEdit(text: string): boolean {
  const t = (text ?? '').trim();
  return t.length >= 4 && t.length <= 240 && !t.startsWith('/') && !QUESTION_START.test(t) && (EDIT_VERB.test(t) || PHOTO_WORD.test(t) || Object.keys(detectDesign(t)).length > 0 || wantsDifferentDesign(t));
}

/** "add a picture from the internet", "look for his photo online": the photo should be searched for on the web. */
export function wantsOnlinePhoto(text: string): boolean {
  return PHOTO_WORD.test(text) && /\b(internet|online|web|google|wikipedia|search|look(ing)? (it )?(up|for|on)|find (it|one|a)|from the net)\b/i.test(text);
}

const NOT_ROLES = /^(job|jobs|work|position|career|application|interview|internship|company|abroad|overseas|me|my)\b/i;

/** The job a resume is asked for: "create me a resume for a nurse in pdf" gives "nurse". */
export function roleFromRequest(text: string): string | null {
  const m = /\b(?:for|as)\s+(?:a|an|the)\s+([a-z][a-z\s/&-]{2,40}?)(?=\s+(?:in|with|using|and|pdf|word|docx|that|who|please)\b|[.,!?]|$)/i.exec(text ?? '');
  const role = m?.[1]?.trim();
  return role && !NOT_ROLES.test(role) ? role : null;
}

/** The user points at their own saved resume ("update my resume", "from my cv"). */
export function usesMyResume(text: string): boolean {
  return /\b(my (saved |current |old |own )?(resume|cv)|from my (resume|cv)|using my|update my|redo my|improve my)\b/i.test(text ?? '');
}

/**
 * A short message that is just a list of jobs asked for in plain words: "accountant jobs remote",
 * "nursing jobs in cebu", "hiring in davao". Questions and advice requests are not job searches.
 */
export function looksLikeJobSearch(text: string): boolean {
  const t = (text ?? '').trim();
  const words = t.split(/\s+/).length;
  if (words < 2 || words > 12 || /\?\s*$/.test(t) || /^\s*(how|what|why|when|which|who|should|can|could|is|are|do|does|tips|advice|explain|write|make|create|help)\b/i.test(t)) {
    return false;
  }
  return /\b(jobs?|vacanc\w+|openings?|hiring|careers?)\b/i.test(t);
}
