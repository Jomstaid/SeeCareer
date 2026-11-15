import JSZip from 'jszip';

import { isResumeEdit, detectDesign } from './intent';
import { PAPERS, customPaper, detectPaper, normalizeResume, paperOf, parseResumeJson } from './resumedata';
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
