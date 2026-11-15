// What the assistant is for. SeeCareer helps with work: finding jobs, resumes, cover letters, applications, interviews,
// skills and career choices. Questions about anything else (celebrities, politics, trivia, entertainment, homework) get a
// short, friendly "I focus on your career" instead of an answer, the way a focused tool should behave.
const CAREER =
  /\b(jobs?|work(ing|place)?|career|careers|resume|r[eé]sum[eé]|cv|curriculum|cover letter|interview\w*|hire|hiring|hired|employ\w*|salary|salaries|wage|apply|applying|application|applicant|skills?|upskill|reskill|company|companies|employer|boss|manager|colleague|coworker|office|intern\w*|training|certif\w+|course|degree|diploma|graduate|graduat\w*|portfolio|linkedin|profession\w*|freelanc\w*|remote|resign\w*|promotion|negotiat\w*|vacanc\w+|openings?|recruit\w*|industry|startup|business|reference|offer letter|probation|shift|overtime|benefits|contract)\b/i;

// The message is clearly about work or careers (no need to ask anyone).
export function obviouslyCareer(text: string): boolean {
  return CAREER.test(text ?? '');
}

// The question for the quick check that decides whether a message is about work.
export const scopeQuestion =
  'You decide if a message belongs in a career assistant. The assistant covers: finding jobs, resumes and CVs, cover letters, job applications, ' +
  'interviews, skills and learning for work, careers and professions, salaries, workplace situations, companies or industries a person might work in. ' +
  'It does NOT cover: celebrities, politics, news, sports, entertainment, general trivia, homework, recipes, health, relationships, programming help unrelated to getting a job. ' +
  'Reply with exactly one word: yes (in scope) or no (out of scope).';

// What is said when a message is outside what the assistant does.
export const offTopicReply =
  "That's outside what I do. I'm the SeeCareer assistant and I focus on your career: finding jobs, building resumes and cover letters, " +
  'preparing for interviews and planning the skills you need. Pick one of these, or ask me something about your work.';

// Keyboard mashing and random letters ("asdfgh", "jsjsjsjs", "qwerty", "???") get a friendly "I did not get that"
// instead of being sent to the AI, which would only guess what the user meant.
const keyboardRuns = /(qwer|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|uiop|yuio|tyui)/;

function gibberishWord(word: string): boolean {
  return (
    (word.length >= 5 && !/[aeiouy]/.test(word)) || // no vowels at all: "jskdjf"
    /(.)\1{3,}/.test(word) || // the same letter again and again: "aaaaa"
    (word.length >= 6 && /^(.{1,3})\1{2,}$/.test(word)) || // a short piece repeated: "jsjsjs", "asdasd"
    (word.length >= 4 && (keyboardRuns.test(word) || keyboardRuns.test([...word].reverse().join('')))) // keys next to each other: "asdf", "fdsa"
  );
}

export function looksLikeNonsense(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase();
  if (!t || t.length > 60 || obviouslyCareer(t)) {
    return false;
  }
  // only symbols or punctuation ("???", "...", "!!!")
  if (!/[\p{L}\p{N}]/u.test(t)) {
    return true;
  }
  const words = t.match(/[a-z]+/g) ?? [];
  const bad = words.filter(gibberishWord);
  return bad.length > 0 && words.every((w) => w.length <= 2 || gibberishWord(w));
}

export const nonsenseReply =
  "Sorry, I didn't understand that message. I'm **SeeCareer AI** and I help with your career. " +
  'You can ask me to find jobs, check your resume, write a cover letter or practice an interview. Try one of these:';
