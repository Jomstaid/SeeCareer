import { buildFile } from './file-export';
import { kindOf, readAttachment } from './file-reader';

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

  it('reads text files and rejects unsupported ones', async () => {
    const txt = await readAttachment(new File(['Hello resume text'], 'notes.txt', { type: 'text/plain' }));
    expect(txt.text).toBe('Hello resume text');
    expect(kindOf(new File(['x'], 'old.ppt'))).toBeNull();
    await expect(readAttachment(new File([new Uint8Array([0, 1, 0])], 'old.ppt'))).rejects.toThrow(/can't be read/);
    await expect(readAttachment(new File([''], 'empty.txt'))).rejects.toThrow(/empty/);
  });
});

import { explain } from './file-reader';

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

  it('reads an unknown extension when the content is text, and rejects real binaries', async () => {
    const log = await readAttachment(new File(['2026-11-04 server started\nready'], 'server.log2'));
    expect(log.text).toContain('server started');
    const binary = new File([new Uint8Array([0, 1, 2, 0, 255, 0, 3])], 'thing.bin');
    await expect(readAttachment(binary)).rejects.toThrow(/can't be read/);
  });
});
