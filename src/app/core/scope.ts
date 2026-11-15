const CAREER =
  /\b(jobs?|work(ing|place)?|career|careers|resume|r[eé]sum[eé]|cv|curriculum|cover letter|interview\w*|hire|hiring|hired|employ\w*|salary|salaries|wage|apply|applying|application|applicant|skills?|upskill|reskill|company|companies|employer|boss|manager|colleague|coworker|office|intern\w*|training|certif\w+|course|degree|diploma|graduate|graduat\w*|portfolio|linkedin|profession\w*|freelanc\w*|remote|resign\w*|promotion|negotiat\w*|vacanc\w+|openings?|recruit\w*|industry|startup|business|reference|offer letter|probation|shift|overtime|benefits|contract)\b/i;

export function obviouslyCareer(text: string): boolean {
  return CAREER.test(text ?? '');
}

export const scopeQuestion =
  'You decide if a message belongs in a career assistant. The assistant covers: finding jobs, resumes and CVs, cover letters, job applications, ' +
  'interviews, skills and learning for work, careers and professions, salaries, workplace situations, companies or industries a person might work in. ' +
  'It does NOT cover: celebrities, politics, news, sports, entertainment, general trivia, homework, recipes, health, relationships, programming help unrelated to getting a job. ' +
  'Reply with exactly one word: yes (in scope) or no (out of scope).';

export const offTopicReply =
  "That's outside what I do. I'm the SeeCareer assistant and I focus on your career: finding jobs, building resumes and cover letters, " +
  'preparing for interviews and planning the skills you need. Pick one of these, or ask me something about your work.';

const keyboardRuns = /(qwer|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|uiop|yuio|tyui)/;

function gibberishWord(word: string): boolean {
  return (
    (word.length >= 5 && !/[aeiouy]/.test(word)) ||
    /(.)\1{3,}/.test(word) ||
    (word.length >= 6 && /^(.{1,3})\1{2,}$/.test(word)) ||
    (word.length >= 4 && (keyboardRuns.test(word) || keyboardRuns.test([...word].reverse().join(''))))
  );
}

export function looksLikeNonsense(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase();
  if (!t || t.length > 60 || obviouslyCareer(t)) {
    return false;
  }
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
