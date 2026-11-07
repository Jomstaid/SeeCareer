/**
 * What the assistant is for. SeeCareer helps with work: finding jobs, resumes, cover letters, applications, interviews,
 * skills and career choices. Questions about anything else (celebrities, politics, trivia, entertainment, homework) get a
 * short, friendly "I focus on your career" instead of an answer, the way a focused tool should behave.
 */
const CAREER =
  /\b(jobs?|work(ing|place)?|career|careers|resume|r[eé]sum[eé]|cv|curriculum|cover letter|interview\w*|hire|hiring|hired|employ\w*|salary|salaries|wage|apply|applying|application|applicant|skills?|upskill|reskill|company|companies|employer|boss|manager|colleague|coworker|office|intern\w*|training|certif\w+|course|degree|diploma|graduate|graduat\w*|portfolio|linkedin|profession\w*|freelanc\w*|remote|resign\w*|promotion|negotiat\w*|vacanc\w+|openings?|recruit\w*|industry|startup|business|reference|offer letter|probation|shift|overtime|benefits|contract)\b/i;

/** The message is clearly about work or careers (no need to ask anyone). */
export function obviouslyCareer(text: string): boolean {
  return CAREER.test(text ?? '');
}

/** The question for the quick check that decides whether a message is about work. */
export const SCOPE_QUESTION =
  'You decide if a message belongs in a career assistant. The assistant covers: finding jobs, resumes and CVs, cover letters, job applications, ' +
  'interviews, skills and learning for work, careers and professions, salaries, workplace situations, companies or industries a person might work in. ' +
  'It does NOT cover: celebrities, politics, news, sports, entertainment, general trivia, homework, recipes, health, relationships, programming help unrelated to getting a job. ' +
  'Reply with exactly one word: yes (in scope) or no (out of scope).';

/** What is said when a message is outside what the assistant does. */
export const OFF_TOPIC_REPLY =
  "That's outside what I do. I'm the SeeCareer assistant and I focus on your career: finding jobs, building resumes and cover letters, " +
  'preparing for interviews and planning the skills you need. Pick one of these, or ask me something about your work.';
