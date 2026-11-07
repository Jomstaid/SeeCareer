import JSZip from 'jszip';

import { ACCENTS, ResumeData, TEMPLATES, normalizeResume, sectionOrder } from './resumedata';
import { buildResumeDocx, buildResumePdf, contrastWithWhite, ensureContrast, hexToRgb } from './resumerender';

const SAMPLE: ResumeData = normalizeResume({
  name: 'Jomar Alcantara',
  title: 'Backend Developer / IT Specialist',
  contact: { email: 'info@example.com', phone: '+63 956 782 0554', location: 'Lambakin, Jaen, NE, Philippines', links: ['example.com', 'github.com/example'] },
  summary: 'Motivated IT specialist with 1 year of programming and graphic design experience, seeking a backend development role. Proficient in Python, HTML, CSS and Bash scripting, with a strong foundation in object-oriented programming, data structures and databases.',
  skills: [
    { group: 'Technical', items: ['Python', 'HTML', 'CSS', 'Bash', 'After Effects', 'Adobe Premiere', 'Adobe Photoshop', 'Graphic Design', 'Backend Support', 'AI Community Management'] },
    { group: 'Tools & Platforms', items: ['Telegram Bot Development', 'Blockchain / NFT Platforms', 'Play-to-Earn Games', 'Minecraft Server Administration'] },
    { group: 'Soft Skills', items: ['Problem Solving', 'Multitasking', 'Attention to Detail', 'Teamwork'] },
  ],
  experience: [
    { role: 'Backend Support', company: 'Private Team', location: 'Remote', dates: '2023 - Present', bullets: ['Provided backend support by monitoring and managing community groups across multiple platforms', 'Developed and maintained AI-driven tools to automate community management tasks', 'Supported cryptocurrency trading operations within the team'] },
    { role: 'IT Developer', company: 'Severe Rise Games', location: 'Remote', dates: '2021 - 2022', bullets: ['Contributed to IT development initiatives within a Cryptoverse, Blockchain, NFT and Play-to-Earn gaming company', 'Led development of Telegram bots that automated community management and moderation', 'Collaborated with like-minded team members to deliver technical solutions'] },
    { role: 'Owner & Server Administrator', company: 'Createstaid Server', location: 'Philippines', dates: '2020', bullets: ['Founded and administered a Minecraft server built for community enjoyment and player engagement', 'Managed server operations, promotion and player community growth'] },
  ],
  education: [
    { degree: 'Bachelor of Film and Media Studies - Video Production', school: '', dates: '2022', details: '' },
    { degree: 'Bachelor of Fine Arts - Graphic Design', school: '', dates: '2021', details: '' },
    { degree: 'Certificate in Online Course - Python Class', school: '', dates: '2019', details: '' },
  ],
  certifications: ['Python Programming Certificate (Online Course, 2019)'],
  languages: ['Filipino', 'English'],
});

/** A made-up portrait (sky, shoulders, head, hair) so the photo features can be tested and looked at. */
async function fakePortrait(): Promise<string> {
  const zlib = await import('node:zlib');
  const n = 180;
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      let c = [186, 214, 238];
      if (Math.hypot((x - 90) / 78, (y - 190) / 70) < 1) c = [52, 73, 94];
      if (Math.hypot((x - 90) / 30, (y - 80) / 38) < 1) c = [231, 187, 150];
      if (Math.hypot((x - 90) / 36, (y - 64) / 34) < 1 && y < 62) c = [58, 40, 30];
      const o = y * (n * 3 + 1) + 1 + x * 3;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
    }
  }
  const table = new Int32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b: Buffer) => {
    let c = -1;
    for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(n, 0);
  head.writeUInt32BE(n, 4);
  head[8] = 8;
  head[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

const countPages = async (blob: Blob): Promise<number> =>
  (new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer())).match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

describe('photo, section order and fit to one page', () => {
  const dir = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RESUME_SAMPLES_DIR'];
  const save = async (name: string, blob: Blob) => {
    if (!dir) {
      return;
    }
    const fs = await import('node:fs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()));
  };

  it('keeps a profile photo through cleaning, and drops a bad one', async () => {
    const photo = await fakePortrait();
    expect(normalizeResume({ name: 'Ana', summary: 'x', photo }).photo).toBe(photo);
    expect(normalizeResume({ name: 'Ana', summary: 'x', photo: 'http://evil.example/a.png' }).photo).toBeUndefined();
    expect(normalizeResume({ name: 'Ana', summary: 'x', photo: 'data:text/html;base64,AAAA' }).photo).toBeUndefined();
  });

  for (const template of TEMPLATES.map((t) => t.key)) {
    it(`draws the photo in the ${template} design (PDF) and embeds it (Word)`, async () => {
      const photo = await fakePortrait();
      const withPhoto = { ...SAMPLE, photo };
      const pdf = await buildResumePdf(withPhoto, template, ACCENTS[4].hex);
      const plain = await buildResumePdf(SAMPLE, template, ACCENTS[4].hex);
      expect(pdf.size).toBeGreaterThan(plain.size + 1000); // the picture is inside the file
      await save(`photo-${template}.pdf`, pdf);
      await save(`nophoto-${template}.pdf`, plain);
      const docx = await buildResumeDocx(withPhoto, template, ACCENTS[4].hex);
      const zip = await JSZip.loadAsync(await docx.arrayBuffer());
      expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
      await save(`photo-${template}.docx`, docx);
    }, 60000);
  }

  it('puts education before experience for someone without work experience', () => {
    const fresh = normalizeResume({ name: 'Zed', summary: 'New graduate', education: [{ degree: 'BS IT', school: 'NEUST' }], projects: [{ name: 'App', description: 'x' }] });
    const order = sectionOrder(fresh);
    expect(order.indexOf('education')).toBeLessThan(order.indexOf('experience'));
    expect(sectionOrder(SAMPLE).indexOf('experience')).toBeLessThan(sectionOrder(SAMPLE).indexOf('education'));
  });

  it("follows the AI's order and adds any section it forgot", () => {
    const d = normalizeResume({ name: 'Ana', summary: 'x', design: { order: ['education', 'summary', 'bogus', 'education'] } });
    const order = sectionOrder(d);
    expect(order.slice(0, 2)).toEqual(['education', 'summary']);
    expect(order.length).toBe(7);
    expect(new Set(order).size).toBe(7);
  });

  it('keeps a normal resume on one page and a tiny one too', async () => {
    const normal = await buildResumePdf(SAMPLE, 'modern', ACCENTS[0].hex);
    await save('fit-modern.pdf', normal);
    expect(await countPages(normal)).toBe(1);
    const tiny = await buildResumePdf(normalizeResume({ name: 'Zed', summary: 'Hi there' }), 'minimal', ACCENTS[0].hex);
    expect(await countPages(tiny)).toBe(1);
  }, 60000);

  it('keeps white text readable on any accent colour', () => {
    const lightYellow = '#facc15';
    expect(contrastWithWhite(hexToRgb(lightYellow))).toBeLessThan(4.5);
    expect(contrastWithWhite(hexToRgb(ensureContrast(lightYellow)))).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#1e3a8a')).toBe('#1e3a8a'); // already dark enough: unchanged
  });
});
