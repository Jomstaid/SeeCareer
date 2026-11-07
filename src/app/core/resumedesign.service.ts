import { Injectable } from '@angular/core';

import { AiService, ApiMessage, ContentPart } from './ai.service';
import { ACCENTS, RESUME_JSON_SHAPE, ResumeData, ResumeTemplate, TEMPLATES, accentFromName, parseResumeJson } from './resumedata';

export interface DesignResult {
  data: ResumeData;
  model: string;
}

const SYSTEM =
  'You are an expert resume writer and ATS specialist. You reply with ONE JSON object and nothing else: no explanation, no markdown, no code fence.\n' +
  `The JSON must have exactly this shape (use "" or [] for anything unknown):\n${RESUME_JSON_SHAPE}\n\n` +
  'Writing rules:\n' +
  '- Use ONLY facts the user gave. Never invent employers, schools, dates, numbers, links or skills. Leave unknown fields empty.\n' +
  '- Bullets start with a strong action verb (Built, Led, Reduced, Designed...) and say what was done and the result. Use numbers only if the user gave them.\n' +
  '- At most 5 bullets per job, most important first. Jobs and schools newest first.\n' +
  '- Summary: 2 to 3 sentences, no "I", tailored to the target title.\n' +
  '- Group skills sensibly (Technical, Tools, Soft skills). Keep each item short.\n' +
  '- Fix spelling and grammar. Keep the user\'s language.\n' +
  '- Fill in "design" like a professional designer who studies the person first. Pick the template by field, seniority and personality:\n' +
  TEMPLATES.map((t) => `    ${t.key}: ${t.blurb}. Best for ${t.fits}.`).join('\n') +
  '\n  Choose the accent to fit the field: Blue or Navy (tech, business, trust), Indigo (software, data), Teal or Green (health, education, environment), Forest (finance, nature, trades), ' +
  'Purple or Rose (creative, media, beauty), Burgundy or Gold (law, luxury, hospitality, executive), Red or Orange (sales, marketing, energy), Slate or Charcoal (corporate, engineering). ' +
  'You may also give any hex colour such as "#0e7490" when it suits the person better. Do not always pick modern and blue: vary the design for different people.\n' +
  '  Order: list the sections strongest first. Use summary, experience, education, skills, projects first for people with relevant work; ' +
  'for students and fresh graduates with little or no work experience put summary, education, projects, skills, then experience. Always include every section key.\n' +
  '- Keep the resume to what fits well on one page: at most 4 jobs, 4 bullets per job, and the most relevant skills.';

const DESIGNER =
  'You are a resume designer. Choose the look of a resume. Reply with ONE JSON object and nothing else: {"template":"...","accent":"...","reason":"one short sentence"}.\n' +
  'Templates:\n' + TEMPLATES.map((t) => `${t.key}: ${t.blurb}. Best for ${t.fits}.`).join('\n') + '\n' +
  'Accent: one of ' + ACCENTS.map((a) => a.name).join(', ') + ', or a hex colour like #0e7490.';

/** Turns resume text into structured data for the designer, and applies the user's change requests. */
@Injectable({ providedIn: 'root' })
export class ResumeDesignService {
  constructor(private ai: AiService) {}

  /** Builds a resume from the user's text (their saved resume, notes or an uploaded file's text). */
  fromText(text: string, extraInstructions = ''): Promise<DesignResult> {
    return this.fromInput({ text, instructions: extraInstructions });
  }

  /**
   * Builds a resume from whatever the user gave: text, pictures (a photo or scan of a resume), and their request.
   * When there is almost no information, the AI writes a ready-to-fill template for the role with [placeholders].
   */
  fromInput(input: { text?: string; images?: string[]; request?: string; instructions?: string; person?: string }): Promise<DesignResult> {
    const text = (input.text ?? '').trim();
    const images = input.images ?? [];
    const thin = text.length < 120 && !images.length;
    const parts: string[] = [];
    if (input.request?.trim()) {
      parts.push(`The user's request: "${input.request.trim()}"`);
    }
    if (input.instructions?.trim()) {
      parts.push(`Extra instructions from the user: ${input.instructions.trim()}`);
    }
    if (thin) {
      parts.push(
        'The user gave little or no personal information. Write a complete, ready-to-fill resume TEMPLATE for the role in their request. ' +
          'Use clear [placeholders] for every personal fact (name, contact, school, company, dates), and write realistic role-appropriate bullets and skills with [brackets] where a number or name belongs. ' +
          (input.person ? `The resume is for ${input.person}. Use exactly this name, and a placeholder for everything else about them.` : 'Set the name to "[Your Name]".'),
      );
    } else if (text) {
      parts.push(`INFORMATION:\n${text.slice(0, 9000)}`);
    }
    if (images.length) {
      parts.push('The resume or notes are in the attached picture(s). Read all the text in them carefully and use only what you can read.');
    }
    const body = 'Create the best possible resume.\n' + parts.join('\n\n');
    const content: string | ContentPart[] = images.length
      ? [{ type: 'text', text: body }, ...images.slice(0, 3).map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))]
      : body;
    return this.ask([{ role: 'user', content }]);
  }

  /**
   * Picks a look for this person, like a designer would. `current` is excluded when the user asked for something different.
   * `request` carries any wishes ("something creative", "more professional").
   */
  async chooseDesign(data: ResumeData, request: string, current?: { template: ResumeTemplate; accent: string }): Promise<{ template: ResumeTemplate; accent: string; reason: string }> {
    const facts =
      `Person: ${data.name || 'unknown'}, ${data.title || 'no title'}. ` +
      `${data.experience.length} jobs, ${data.education.length} education entries, ${data.projects.length} projects, ${data.skills.reduce((n, g) => n + g.items.length, 0)} skills. ` +
      `${data.photo ? 'Has a photo.' : 'No photo.'} Summary: ${data.summary.slice(0, 200)}`;
    const ask =
      `${facts}\nCurrent look: ${current ? current.template + ', accent ' + current.accent : 'none'}.\nWhat the user said: "${request}".\n` +
      (current ? `Choose a clearly DIFFERENT template than ${current.template} and a different accent colour, unless the user asked to keep something.` : 'Choose the best look.');
    const r = await this.ai.chat([{ role: 'system', content: DESIGNER }, { role: 'user', content: ask }], 700, { fast: true, temperature: 0.7 });
    const m = /\{[\s\S]*\}/.exec(r.content);
    let template: ResumeTemplate | undefined;
    let accent: string | undefined;
    let reason = '';
    try {
      const j = JSON.parse(m?.[0] ?? '{}') as { template?: string; accent?: string; reason?: string };
      template = TEMPLATES.find((t) => t.key === String(j.template).toLowerCase())?.key;
      accent = accentFromName(j.accent);
      reason = String(j.reason ?? '').slice(0, 160);
    } catch {
      /* use a sensible fallback below */
    }
    // never hand back the same look when a different one was asked for
    const others = TEMPLATES.filter((t) => t.key !== current?.template);
    if (!template || template === current?.template) {
      template = others[Math.floor(Math.random() * others.length)].key;
    }
    if (!accent || accent === current?.accent) {
      const colours = ACCENTS.filter((a) => a.hex !== current?.accent);
      accent = colours[Math.floor(Math.random() * colours.length)].hex;
    }
    return { template, accent, reason };
  }

  /** Changes an existing resume, for example "make it one page" or "emphasize teamwork". */
  refine(data: ResumeData, instruction: string): Promise<DesignResult> {
    const { photo, ...withoutPhoto } = data; // the picture is never sent to the AI
    const user =
      `Here is the current resume as JSON:\n${JSON.stringify(withoutPhoto)}\n\n` +
      `Change request: ${instruction.trim()}\n\n` +
      'Return the complete updated resume in the same JSON shape. Do not add facts that are not in the current resume or the request.';
    return this.ask([{ role: 'user', content: user }]).then((r) => (photo ? { ...r, data: { ...r.data, photo } } : r));
  }

  /** Asks the AI; if the answer is not valid resume JSON, shows it the problem and asks once more. */
  private async ask(user: ApiMessage[]): Promise<DesignResult> {
    const messages: ApiMessage[] = [{ role: 'system', content: SYSTEM }, ...user];
    const first = await this.ai.chat(messages, 2000, { temperature: 0.2 });
    try {
      return { data: parseResumeJson(first.content), model: first.model };
    } catch (e) {
      const retry = await this.ai.chat(
        [
          ...messages,
          { role: 'assistant', content: first.content.slice(0, 4000) },
          {
            role: 'user',
            content: `That was not usable (${(e as Error).message}). Reply again with ONLY the JSON object in the required shape. No other text.`,
          },
        ],
        2000,
        { temperature: 0 },
      );
      return { data: parseResumeJson(retry.content), model: retry.model };
    }
  }
}
