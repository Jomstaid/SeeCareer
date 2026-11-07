import { isLetterRequest, letterize, nameFromRequest, stripChatter, titleOf } from './docclean';
import { clean } from './resumerender';
import { parseBlocks, plain } from './fileexport';

// shaped like the answer that ended up as a garbled PDF
const MESSY = `I can write you a complete example resume right here! 🎉

However, for the PDF download and professionally designed version, here's how to get it:
- 📄 Download as PDF — use the download button on my response
- 🎨 Designed resume — use the "Design my resume" feature

Let me build you a solid example resume now.

# JUAN DELA CRUZ
📍 Quezon City | 📞 0917-123-4567 | juan.delacruz@email.com

## OBJECTIVE
Detail-oriented graduate seeking an Admin role.

## SKILLS
- Computer: MS Office (Word, Excel, PowerPoint)
- Communication: strong written and verbal

---

💬 Want me to customize this for YOU?
Just share:
1. Your name & contact info
2. Your degree & school
3. The job you're applying for`;

describe('stripChatter: only the document is left', () => {
  const out = stripChatter(MESSY);

  it('removes the greeting and the instructions before the document', () => {
    expect(out.startsWith('# JUAN DELA CRUZ')).toBe(true);
    expect(out).not.toContain('I can write you');
    expect(out).not.toContain('download button');
  });

  it('removes the offer and the questions after it', () => {
    expect(out).not.toContain('Want me to customize');
    expect(out).not.toContain('Your degree & school');
    expect(out.trimEnd().endsWith('strong written and verbal')).toBe(true);
  });

  it('removes emoji and keeps the real content', () => {
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).toContain('## OBJECTIVE');
    expect(out).toContain('MS Office');
    expect(out).toContain('juan.delacruz@email.com');
  });

  it('leaves a clean document alone', () => {
    const doc = '# Cover Letter\n\nDear Hiring Manager,\n\nI am applying for the role.\n\nSincerely,\nAna';
    expect(stripChatter(doc)).toBe(doc);
  });

  it('unwraps a code fence and finds the title', () => {
    expect(stripChatter('```markdown\n# Plan\n- a\n```')).toBe('# Plan\n- a');
    expect(titleOf('intro\n# **My Plan**\ntext')).toBe('My Plan');
  });
});

describe('documents never contain garbled symbols', () => {
  it('drops emoji for the PDF font', () => {
    expect(clean('Quezon City 📍 | 📞 0917')).toBe('Quezon City | 0917');
    expect(plain('**Skills** 🎨 and 📄')).toBe('Skills  and ');
  });

  it('turns markdown tables into plain readable lines', () => {
    const blocks = parseBlocks('| Day | Task |\n|---|---|\n| Mon | Read |');
    expect(blocks.map((b) => b.text)).toEqual(['Day   |   Task', 'Mon   |   Read']);
  });
});

describe('nameFromRequest: a readable file name from what the user asked', () => {
  it('drops the filler and the format words', () => {
    expect(nameFromRequest('write me a cover letter for a marketing assistant job as pdf')).toBe('Cover letter for marketing assistant job');
    expect(nameFromRequest('can you make a weekly study schedule in word')).toBe('Weekly study schedule');
  });

  it('has a fallback when nothing is left', () => {
    expect(nameFromRequest('please make it')).toMatch(/^SeeCareer \d{4}-\d{2}-\d{2}$/);
  });
});

describe('letters are real letters', () => {
  it('knows when a letter or email was asked for', () => {
    expect(isLetterRequest('write a cover letter for a nurse job')).toBe(true);
    expect(isLetterRequest('draft an email to my landlord')).toBe(true);
    expect(isLetterRequest('make a weekly study schedule')).toBe(false);
  });

  it('removes the title, section headings and dividers but keeps the letter', () => {
    const messy = ['# Cover Letter', '', '---', '', '## Opening', '', 'Dear Ms. Cruz,', '', 'I am applying for the role.', '', '## Closing', '', 'Sincerely,', 'Ana'].join('\n');
    const expected = ['Dear Ms. Cruz,', '', 'I am applying for the role.', '', 'Sincerely,', 'Ana'].join('\n');
    expect(letterize(messy)).toBe(expected);
  });
});
