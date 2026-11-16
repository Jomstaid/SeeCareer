import JSZip from 'jszip';

import { isResumeEdit, detectDesign, detectIntent, fixTypos, followUpAction, personFromRequest } from './intent';
import { PAPERS, customPaper, detectPaper, normalizeResume, paperOf, paperScale, parseResumeJson } from './resumedata';
import { buildResumeDocx, buildResumePdf } from './resumerender';

const SAMPLE = normalizeResume({
  name: 'Maria Santos',
  title: 'Nurse',
  summary: 'Registered nurse with three years of hospital experience.',
  skills: [{ group: 'Clinical', items: ['Patient care', 'IV therapy'] }],
  experience: [{ role: 'Staff Nurse', company: 'City Hospital', dates: '2022 - Present', bullets: ['Cared for 20 patients a shift'] }],
  education: [{ degree: 'BS Nursing', school: 'NEUST', dates: '2018 - 2022' }],
});

const pageSizes = async (blob: Blob) => {
  const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  return [...text.matchAll(/\/MediaBox \[([\d. ]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
};

describe('paper sizes', () => {
  it('reads the paper size the user asks for', () => {
    expect(detectPaper('make it legal size')).toBe('legal');
    expect(detectPaper('change the paper to legal')).toBe('legal');
    expect(detectPaper('legal')).toBe('legal');
    expect(detectPaper('use letter size paper')).toBe('letter');
    expect(detectPaper('short bond please')).toBe('letter');
    expect(detectPaper('print it on long bond')).toBe('folio');
    expect(detectPaper('make it A5')).toBe('a5');
    expect(detectPaper('A3 paper')).toBe('a3');
    expect(detectPaper('back to A4')).toBe('a4');
    expect(detectPaper('tabloid')).toBe('tabloid');
    expect(detectPaper('executive paper size')).toBe('executive');
    expect(detectPaper('B5 size')).toBe('b5');
  });

  it('understands any custom size in inches, millimetres or centimetres', () => {
    expect(detectPaper('make the paper 8.5 x 13 inches')).toBe('folio');
    expect(detectPaper('8.5 x 14 in')).toBe('legal');
    expect(detectPaper('page size 210 x 297 mm')).toBe('a4');
    expect(detectPaper('paper 8 x 10 inches')).toBe('custom-576x720');
    expect(detectPaper('size 20 by 30 cm')).toBe('custom-567x850');
    expect(paperOf('custom-576x720').label).toBe('Custom (8 × 10 in)');
  });

  it('does not mistake normal words for a paper size', () => {
    expect(detectPaper('resume for a legal assistant with 3 years experience')).toBeUndefined();
    expect(detectPaper('write a cover letter for this job')).toBeUndefined();
    expect(detectPaper('write a letter')).toBeUndefined();
    expect(detectPaper('add skill Python')).toBeUndefined();
    expect(detectPaper('I worked 3 years')).toBeUndefined();
  });

  it('keeps executive as a design when no paper word is used', () => {
    expect(detectDesign('make it executive').template).toBe('executive');
    expect(detectDesign('executive paper size').template).toBeUndefined();
  });

  it('treats a paper request as a resume edit', () => {
    expect(isResumeEdit('make it legal size')).toBe(true);
    expect(isResumeEdit('change paper to A5')).toBe(true);
  });

  it('keeps a custom size inside safe limits and falls back to A4', () => {
    expect(customPaper(10, 10)).toBe('custom-216x216');
    expect(customPaper(0, 100)).toBeUndefined();
    expect(paperOf(undefined).key).toBe('a4');
    expect(paperOf('nonsense').key).toBe('a4');
  });

  it('reads the paper from the AI answer', () => {
    const d = parseResumeJson(JSON.stringify({ name: 'Ana', summary: 'Hi there, I am a nurse.', design: { paper: 'legal' } }));
    expect(d.design?.paper).toBe('legal');
  });

  for (const p of PAPERS) {
    it(`makes the PDF page ${p.short} size`, async () => {
      const blob = await buildResumePdf({ ...SAMPLE, design: { paper: p.key } }, 'modern', '#0369a1');
      const sizes = await pageSizes(blob);
      expect(sizes.length).toBeGreaterThan(0);
      for (const [, , w, h] of sizes) {
        expect(Math.abs(w - p.w)).toBeLessThan(1);
        expect(Math.abs(h - p.h)).toBeLessThan(1);
      }
    }, 30000);
  }

  it('makes the Word page the chosen size', async () => {
    for (const template of ['modern', 'classic'] as const) {
      const blob = await buildResumeDocx({ ...SAMPLE, design: { paper: 'legal' } }, template, '#0369a1');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toMatch(/<w:pgSz[^>]*w:w="12240"[^>]*w:h="20160"/);
    }
  }, 30000);
});

describe('paper scale and human follow-ups', () => {
  it('grows the design with bigger paper and shrinks it a little for small paper', () => {
    expect(paperScale('a4')).toBe(1);
    expect(paperScale('a3')).toBeCloseTo(1.414, 2);
    expect(paperScale('a5')).toBe(0.8);
    expect(paperScale('legal')).toBeCloseTo(612 / 595.28, 3);
  });

  it('draws the A3 PDF bigger instead of leaving empty space', async () => {
    const blob = await buildResumePdf({ ...SAMPLE, design: { paper: 'a3' } }, 'modern', '#0369a1');
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toMatch(/q 1\.414\d 0 0 1\.414\d /);
  }, 30000);

  it('makes the Word text bigger on A3', async () => {
    const small = await buildResumeDocx({ ...SAMPLE, design: { paper: 'a4' } }, 'modern', '#0369a1');
    const big = await buildResumeDocx({ ...SAMPLE, design: { paper: 'a3' } }, 'modern', '#0369a1');
    const size = async (b: Blob) => {
      const xml = await (await JSZip.loadAsync(await b.arrayBuffer())).file('word/document.xml')!.async('string');
      return Math.max(...[...xml.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => +m[1]));
    };
    expect(await size(big)).toBeGreaterThan(await size(small));
  }, 30000);

  it('reads the person and the paper from a messy request', () => {
    expect(personFromRequest('create me resume about SpongeBob square pants legal')).toBe('SpongeBob square pants');
    expect(detectPaper('create me resume about SpongeBob square pants legal')).toBe('legal');
    expect(detectPaper('make a resume for me in A5')).toBe('a5');
    expect(personFromRequest('can you check my resume of last year')).toBeNull();
    expect(personFromRequest('make my resume about my experience')).toBeNull();
  });

  it('runs the offered action when the user answers in a few words', () => {
    const offer = [
      { label: 'Choose photo', command: 'pickPhoto' },
      { label: 'Find one online', command: 'findPhotoOnline' },
    ];
    expect(followUpAction('search on internet', offer)).toBe(1);
    expect(followUpAction('find it online', offer)).toBe(1);
    expect(followUpAction('google it', offer)).toBe(1);
    expect(followUpAction('yes please', offer)).toBe(1);
    expect(followUpAction('i will upload my own', offer)).toBe(0);
    expect(followUpAction('what jobs fit a nurse in manila with 3 years experience', offer)).toBe(-1);
    expect(followUpAction('sure', [{ label: 'Start mock interview', command: 'mock' }])).toBe(0);
    expect(followUpAction('sure', [{ label: 'A', command: 'a' }, { label: 'B', command: 'b' }])).toBe(-1);
  });
});

describe('messy typing', () => {
  it('still understands a resume request with typos', () => {
    expect(detectIntent('mak me resum pls im nurse 3 yrs exp in manila st lukes')?.kind).toBe('resume');
    expect(detectIntent('creat a rezume for me')?.kind).toBe('resume');
    expect(fixTypos('plz mak ur resum')).toBe('please make your resume');
  });

  it('treats short resume edits with typos as edits', () => {
    expect(isResumeEdit('add skill iv therapy')).toBe(true);
    expect(isResumeEdit('mak it red plz')).toBe(true);
  });
});
