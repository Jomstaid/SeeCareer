import { readAttachment } from './filereader';
import { ACCENTS, ResumeData, normalizeResume, parseResumeJson, resumeToText } from './resumedata';
import { buildResumeDocx, buildResumePdf, clean, hexToRgb } from './resumerender';

const SAMPLE: ResumeData = normalizeResume({
  name: 'Juan Dela Cruz',
  title: 'Junior Frontend Developer',
  contact: { email: 'juan.delacruz@email.com', phone: '+63 912 345 6789', location: 'Cabanatuan City, Philippines', links: ['github.com/juandc', 'linkedin.com/in/juandc'] },
  summary: 'BSIT graduate with hands-on experience building mobile and web apps with Angular, Ionic and TypeScript. Quick learner who ships clean, tested features and works well in small teams.',
  skills: [
    { group: 'Technical', items: ['Angular', 'Ionic', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Git', 'REST APIs', 'SQL'] },
    { group: 'Soft skills', items: ['Teamwork', 'Communication', 'Problem solving'] },
  ],
  experience: [
    { role: 'Junior Web Developer Intern', company: 'Acme Corp', location: 'Remote', dates: 'Jan 2025 - Present', bullets: ['Built 8 mobile screens with Ionic and Angular used by 200+ students', 'Fixed 30+ bugs and wrote unit tests for core services', 'Connected REST APIs and handled loading and error states', 'Reviewed pull requests with two senior developers'] },
    { role: 'Freelance Web Developer', company: 'Self-employed', location: 'Cabanatuan City', dates: '2023 - 2024', bullets: ['Designed and launched 4 small business websites', 'Improved page speed by compressing images and lazy loading', 'Handled client requests and delivered on time'] },
    { role: 'Student Assistant', company: 'NEUST IT Department', location: 'Nueva Ecija', dates: '2022 - 2023', bullets: ['Maintained 40 lab computers and fixed software issues', 'Helped 100+ students with login and network problems'] },
    { role: 'Tutor', company: 'Community Learning Center', location: 'Cabanatuan City', dates: '2021 - 2022', bullets: ['Taught basic programming to 25 high-school students', 'Prepared weekly exercises and quizzes'] },
  ],
  education: [{ degree: 'BS Information Technology', school: 'Nueva Ecija University of Science and Technology', dates: '2022 - 2026', details: 'Mobile Application Development, Web Systems, Database Systems' }],
  projects: [
    { name: 'SeeCareer', description: 'AI career assistant that finds jobs, scores your fit and writes applications.', tech: 'Ionic, Angular, TypeScript' },
    { name: 'Campus Events App', description: 'Mobile app listing school events with reminders.', tech: 'Ionic, Firebase' },
  ],
  certifications: ['Responsive Web Design - freeCodeCamp', 'JavaScript Algorithms - freeCodeCamp'],
  languages: ['English', 'Filipino'],
});

describe('resume data', () => {
  it('cleans messy AI output into a complete resume', () => {
    const d = normalizeResume({ name: '  Ana  ', skills: ['A', 'B'], experience: [{ role: 'Dev', bullets: 'one, two' }, {}], extra: 1 });
    expect(d.name).toBe('Ana');
    expect(d.skills).toEqual([{ group: 'Skills', items: ['A', 'B'] }]); // a flat list becomes one group
    expect(d.experience.length).toBe(1); // the empty entry is dropped
    expect(d.experience[0].bullets).toEqual(['one', 'two']);
    expect(d.contact.links).toEqual([]);
  });

  it('rejects an answer with no resume in it', () => {
    expect(() => normalizeResume({})).toThrow();
    expect(() => parseResumeJson('Sorry, I cannot help with that.')).toThrow();
  });

  it('reads JSON wrapped in a code fence and fixes trailing commas', () => {
    const d = parseResumeJson('Here you go:\n```json\n{"name":"Ben","summary":"Hi there",}\n```\nEnjoy!');
    expect(d.name).toBe('Ben');
    expect(d.summary).toBe('Hi there');
  });

  it('turns a resume into plain text that still looks like a resume', () => {
    const text = resumeToText(SAMPLE);
    expect(text).toContain('Juan Dela Cruz');
    expect(text).toContain('WORK EXPERIENCE');
    expect(text).toContain('juan.delacruz@email.com');
  });

  it('cleans characters the PDF fonts cannot draw', () => {
    expect(clean('Lead → team — “great” ✅ café')).toBe('Lead -> team - "great" café');
    expect(hexToRgb('#0369a1')).toEqual([3, 105, 161]);
  });
});

describe('resume designs', () => {
  const dir = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RESUME_SAMPLES_DIR'];

  async function save(name: string, blob: Blob) {
    if (!dir) {
      return;
    }
    const fs = await import('node:fs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()));
  }

  for (const template of ['modern', 'classic', 'minimal'] as const) {
    it(`builds a real multi-section PDF in the ${template} design`, async () => {
      const blob = await buildResumePdf(SAMPLE, template, ACCENTS[0].hex);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(4000);
      await save(`${template}.pdf`, blob);
    }, 30000);

    it(`builds a Word file in the ${template} design that can be read back`, async () => {
      const blob = await buildResumeDocx(SAMPLE, template, ACCENTS[1].hex);
      const att = await readAttachment(new File([blob], `${template}.docx`));
      expect(att.text).toContain('Juan Dela Cruz');
      expect(att.text).toContain('Acme Corp');
      expect(att.text).toContain('Angular');
      expect(att.text).toContain('Nueva Ecija University');
      await save(`${template}.docx`, blob);
    }, 30000);
  }

  it('works with a very small resume and with every accent colour', async () => {
    const tiny = normalizeResume({ name: 'Zed', summary: 'New graduate looking for a first role.' });
    for (const a of ACCENTS) {
      for (const template of ['modern', 'classic', 'minimal'] as const) {
        const blob = await buildResumePdf(tiny, template, a.hex);
        expect(blob.size).toBeGreaterThan(1000);
      }
    }
  }, 60000);
});

describe('the design the AI suggests', () => {
  it('reads a layout and a colour name', () => {
    const d = normalizeResume({ name: 'Ana', summary: 'x', design: { template: 'Classic', accent: 'purple' } });
    expect(d.design).toEqual({ template: 'classic', accent: '#6d28d9' });
  });

  it('ignores a layout or colour that does not exist', () => {
    const d = normalizeResume({ name: 'Ana', summary: 'x', design: { template: 'fancy', accent: 'hotpink' } });
    expect(d.design).toBeUndefined();
    const only = normalizeResume({ name: 'Ana', summary: 'x', design: { template: 'minimal', accent: 'nope' } });
    expect(only.design).toEqual({ template: 'minimal', accent: undefined });
  });
});
