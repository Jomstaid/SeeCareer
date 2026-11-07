import { buildFile } from './fileexport';
import { kindOf, readAttachment } from './filereader';

const RESUME = '# Juan Dela Cruz\njuan@email.com | Cabanatuan\n## Skills\n- Angular\n- **Ionic**\n## Education\nBSIT, NEUST';

describe('file round trip', () => {
  it('creates a Word file and reads its text back', async () => {
    const blob = await buildFile('docx', 'Resume', RESUME);
    const file = new File([blob], 'resume.docx');
    const att = await readAttachment(file);
    expect(att.kind).toBe('docx');
    expect(att.text).toContain('Juan Dela Cruz');
    expect(att.text).toContain('Ionic');
  }, 30000);

  it('creates a PDF file', async () => {
    const blob = await buildFile('pdf', 'Resume', RESUME);
    expect(blob.size).toBeGreaterThan(1000);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
  }, 30000);

  it('reads text files, and only an empty file is refused', async () => {
    const txt = await readAttachment(new File(['Hello resume text'], 'notes.txt', { type: 'text/plain' }));
    expect(txt.text).toBe('Hello resume text');
    expect(kindOf(new File(['x'], 'old.ppt'))).toBeNull();
    await expect(readAttachment(new File([''], 'empty.txt'))).rejects.toThrow(/empty/);
  });
});

import { explain } from './filereader';

describe('file reader error messages', () => {
  it('names the real problem', () => {
    expect(explain({ name: 'PasswordException', message: 'No password given' }, 'a.pdf')).toMatch(/password-protected/);
    expect(explain({ name: 'InvalidPDFException', message: 'Invalid PDF structure.' }, 'a.pdf')).toMatch(/damaged/);
    expect(explain(new TypeError('Failed to fetch dynamically imported module'), 'a.pdf')).toMatch(/could not start/);
    expect(explain(new Error('something odd'), 'a.pdf')).toMatch(/something odd/);
  });
});

import JSZip from 'jszip';

describe('more file types', () => {
  it('reads an Excel (.xlsx) file', async () => {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', '<sst><si><t>Name</t></si><si><t>Juan</t></si></sst>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row><row><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>');
    const blob = await zip.generateAsync({ type: 'blob' });
    const att = await readAttachment(new File([blob], 'people.xlsx'));
    expect(att.text).toContain('Name\t42');
    expect(att.text).toContain('Juan');
  });

  it('reads a PowerPoint (.pptx) file', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Welcome slide</a:t><a:t>My skills</a:t></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Contact me</a:t></p:sld>');
    const blob = await zip.generateAsync({ type: 'blob' });
    const att = await readAttachment(new File([blob], 'deck.pptx'));
    expect(att.text).toContain('Slide 1');
    expect(att.text).toContain('My skills');
    expect(att.text).toContain('Contact me');
  });

  it('reads an unknown extension when the content is text', async () => {
    const log = await readAttachment(new File(['2026-11-04 server started\nready'], 'server.log2'));
    expect(log.text).toContain('server started');
  });
});

/** Builds a tiny Photoshop file that carries a preview picture, the way real .psd files do. */
function fakePsd(jpeg: number[]): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  const u32 = (n: number) => out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  out.push(0x38, 0x42, 0x50, 0x53); // "8BPS"
  out.push(0, 1, 0, 0, 0, 0, 0, 0); // version + reserved
  out.push(0, 3, 0, 0, 0, 10, 0, 0, 0, 10, 0, 8, 0, 3); // channels, height, width, depth, colour mode
  u32(0); // colour mode data length
  const resource = [0, 0, 0, 1, ...new Array(24).fill(0), ...jpeg]; // thumbnail header (28 bytes) + JPEG
  const pad = resource.length % 2 ? 1 : 0;
  u32(4 + 2 + 2 + 4 + resource.length + pad); // image resources length
  out.push(0x38, 0x42, 0x49, 0x4d, 0x04, 0x0c, 0, 0); // "8BIM", id 1036, empty name (padded)
  u32(resource.length);
  out.push(...resource);
  if (pad) {
    out.push(0);
  }
  return new Uint8Array(out);
}

describe('any file is accepted', () => {
  it('attaches a file it cannot read with just its name, type and size', async () => {
    const att = await readAttachment(new File([new Uint8Array([0, 1, 2, 0, 255, 0, 3])], 'thing.bin'));
    expect(att.kind).toBe('other');
    expect(att.text).toBeUndefined();
    expect(att.note).toContain('thing.bin');
    expect(att.note).toContain('BIN file');
  });

  it('uses the preview picture inside a Photoshop file', async () => {
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9];
    const att = await readAttachment(new File([fakePsd(jpeg)], 'poster.psd'));
    expect(att.kind).toBe('image');
    expect(att.images?.[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(atob(att.images![0].split(',')[1])).toBe(String.fromCharCode(...jpeg));
    expect(att.note).toContain('poster.psd');
  });

  it('still accepts a Photoshop file that has no preview inside', async () => {
    const att = await readAttachment(new File([new Uint8Array(64)], 'plain.psd'));
    expect(att.kind).toBe('other');
    expect(att.note).toContain('plain.psd');
  });

  it('pulls the readable text out of an old binary Office file', async () => {
    const text =
      'Maria Santos resume. Skills: Angular, Ionic, TypeScript and project management experience in Manila. ' +
      'Work experience: web developer intern at BrightApps, built mobile screens and fixed bugs. Education: BS Information Technology, 2021 to 2025.';
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, ...new TextEncoder().encode(text), 0, 0, 0xff]);
    const att = await readAttachment(new File([bytes], 'old resume.doc'));
    expect(att.text).toContain('Maria Santos');
    expect(att.text).toContain('Angular');
  });

  it('attaches a damaged PDF instead of refusing it', async () => {
    const att = await readAttachment(new File(['this is not a real pdf'], 'broken.pdf'));
    expect(att.name).toBe('broken.pdf');
    expect(att.note).toContain('broken.pdf');
  });
});
