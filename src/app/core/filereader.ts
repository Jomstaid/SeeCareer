import { Attachment, AttachmentKind } from './models';
import { newId } from './storage';

export const maxFileBytes = 15 * 1024 * 1024;
export const maxFileText = 15000;
const maxPdfPages = 40;
const scannedPages = 3;
const imageMaxSide = 1600;

export const acceptedFiles = '*/*';

const textExt = /\.(txt|md|csv|json|html?|xml|rtf|log|ya?ml|js|ts|py|java|c|cpp|cs|php|sql)$/i;
const imageExt = /\.(png|jpe?g|webp|gif|bmp)$/i;
const officeExt = /\.(xlsx|pptx|odt|ods|odp)$/i;

export class FileReadError extends Error {}

export function kindOf(file: File): AttachmentKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return 'pdf';
  }
  if (name.endsWith('.docx') || officeExt.test(name)) {
    return 'docx';
  }
  if (file.type.startsWith('image/') || imageExt.test(name)) {
    return 'image';
  }
  if (file.type.startsWith('text/') || textExt.test(name)) {
    return 'text';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size === 0) {
    throw new FileReadError(`"${file.name}" is empty.`);
  }
  let kind = kindOf(file);
  const base: Attachment = { id: newId(), name: file.name, kind: kind ?? 'other', size: file.size };
  const describe = `${file.name} (${typeLabel(file)}, ${formatBytes(file.size)})`;
  const infoOnly = (why: string): Attachment => ({ ...base, note: `${describe}. ${why}` });

  if (file.size > maxFileBytes) {
    return infoOnly('It is a large file, so only its name and type are known.');
  }
  try {
    if (!kind) {
      if (await looksTextual(file)) {
        kind = 'text';
      } else {
        return await readOther(file, base, describe);
      }
    }
    switch (kind) {
      case 'pdf':
        return { ...base, kind, ...(await readPdf(file)) };
      case 'docx':
        return { ...base, kind, text: clip(/\.docx$/i.test(file.name) ? await readDocx(file) : await readOffice(file)) };
      case 'image':
        return { ...base, kind, images: [await imageToDataUrl(file)] };
      default:
        return { ...base, kind, text: clip(await file.text()) };
    }
  } catch {
    return infoOnly('Its content could not be opened, so only its name and type are known.');
  }
}

const extOf = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

function typeLabel(file: File): string {
  const ext = extOf(file.name);
  return ext ? `${ext.toUpperCase()} file` : file.type || 'file';
}

async function readOther(file: File, base: Attachment, describe: string): Promise<Attachment> {
  const buffer = await file.arrayBuffer();
  const ext = extOf(file.name);
  if (ext === 'psd' || ext === 'psb') {
    const preview = psdPreview(buffer);
    if (preview) {
      return { ...base, kind: 'image', images: [preview], note: `${describe}. This is the small preview picture saved inside the Photoshop file.` };
    }
  }
  const found = extractStrings(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4 * 1024 * 1024)));
  if (found.length >= 200) {
    return { ...base, text: clip(found), note: `${describe}. The text found inside the file is shown.` };
  }
  return { ...base, note: `${describe}. Its content is not text.` };
}

export function psdPreview(buf: ArrayBuffer): string | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 40 || v.getUint32(0) !== 0x38425053) {
      return null;
    }
    let p = 26;
    p += 4 + v.getUint32(p);
    const end = p + 4 + v.getUint32(p);
    p += 4;
    while (p + 12 <= end) {
      if (v.getUint32(p) !== 0x3842494d) {
        break;
      }
      const id = v.getUint16(p + 4);
      p += 6;
      const nameLength = v.getUint8(p);
      p += 1 + nameLength;
      if ((1 + nameLength) % 2) {
        p += 1;
      }
      const size = v.getUint32(p);
      p += 4;
      if ((id === 1036 || id === 1033) && v.getUint32(p) === 1 && size > 28) {
        const jpeg = new Uint8Array(buf, p + 28, size - 28);
        let binary = '';
        for (let i = 0; i < jpeg.length; i += 0x8000) {
          binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
        }
        return 'data:image/jpeg;base64,' + btoa(binary);
      }
      p += size + (size % 2);
    }
  } catch {
  }
  return null;
}

export function extractStrings(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  const runs: string[] = latin.match(/[\x20-\x7e\t]{5,}/g) ?? [];
  for (const offset of [0, 1]) {
    const wide = new TextDecoder('utf-16le').decode(bytes.subarray(offset, offset + ((bytes.length - offset) & ~1)));
    runs.push(...(wide.match(/[\x20-\x7e\t]{5,}/g) ?? []));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of runs) {
    const t = r.trim();
    if (/[A-Za-z]{3,}/.test(t) && (t.match(/[A-Za-z0-9 ]/g)?.length ?? 0) / t.length > 0.7 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.join('\n');
}

export function explain(error: unknown, fileName: string): string {
  const e = error as { name?: string; message?: string };
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`;
  if (/PasswordException|password|encrypted/i.test(text)) {
    return `"${fileName}" is password-protected. Remove the password (or save a copy without it) and try again.`;
  }
  if (/InvalidPDFException|MissingPDFException|Invalid PDF|corrupt|bad (zip|xref)|end of central directory/i.test(text)) {
    return `"${fileName}" looks damaged or is not a real file of this type. Try saving it again, or export it as PDF.`;
  }
  if (/dynamically imported|import|worker|Failed to fetch|Loading chunk|ChunkLoad|Unexpected token '<'/i.test(text)) {
    return 'The file reader could not start. Close the app and reopen it (if you run it from a terminal, stop `ionic serve` and start it again), then try again.';
  }
  return `Could not read "${fileName}" (${(e?.message ?? 'unknown error').slice(0, 80)}). Try another copy of the file.`;
}

function clip(text: string): string {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) {
    throw new FileReadError('No readable text was found in this file.');
  }
  return clean.length > maxFileText ? clean.slice(0, maxFileText) + '\n…(file shortened)' : clean;
}

async function readPdf(file: File): Promise<Pick<Attachment, 'text' | 'images' | 'pages' | 'preview'>> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = doc.numPages;

  const render = async (n: number, scale: number, quality: number): Promise<string> => {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL('image/jpeg', quality);
  };

  const parts: string[] = [];
  for (let n = 1; n <= Math.min(pages, maxPdfPages); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      line += item.str ?? '';
      line += item.hasEOL ? '\n' : ' ';
    }
    parts.push(line.trim());
  }
  const text = parts.join('\n\n').trim();
  if (text.length > 40) {
    let preview: string | undefined;
    try {
      preview = await render(1, 1.4, 0.8);
    } catch {
      preview = undefined;
    }
    return { text: clip(text), pages, preview };
  }
  const images: string[] = [];
  for (let n = 1; n <= Math.min(pages, scannedPages); n++) {
    images.push(await render(n, 1.6, 0.85));
  }
  return { images, pages };
}

async function readDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const data = await file.arrayBuffer();
  try {
    return (await mammoth.extractRawText({ arrayBuffer: data })).value;
  } catch (e) {
    const NodeBuffer = (globalThis as { Buffer?: { from(d: ArrayBuffer): unknown } }).Buffer;
    if (!NodeBuffer) {
      throw e;
    }
    return (await mammoth.extractRawText({ buffer: NodeBuffer.from(data) } as never)).value;
  }
}

async function imageToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new FileReadError(`"${file.name}" is not a valid image.`));
      el.src = url;
    });
    const scale = Math.min(1, imageMaxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return file.type === 'image/png' && file.size < 1_500_000
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function looksTextual(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (!bytes.length) {
    return false;
  }
  let odd = 0;
  for (const b of bytes) {
    if (b === 0) {
      return false;
    }
    if (b < 9 || (b > 13 && b < 32)) {
      odd++;
    }
  }
  return odd / bytes.length < 0.02;
}

const decodeXml = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const textsOf = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => decodeXml(m[1].replace(/<[^>]+>/g, '')));

async function readOffice(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  const name = file.name.toLowerCase();

  if (name.endsWith('.pptx')) {
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const out: string[] = [];
    for (const [i, n] of slides.entries()) {
      out.push(`Slide ${i + 1}:\n` + textsOf(await read(n), 'a:t').join('\n'));
    }
    return out.join('\n\n');
  }

  if (name.endsWith('.xlsx')) {
    const shared = textsOf(await read('xl/sharedStrings.xml'), 'si');
    const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
    const out: string[] = [];
    for (const [i, n] of sheets.entries()) {
      const rows: string[] = [];
      for (const row of (await read(n)).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
          const attrs = c[1];
          const body = c[2] ?? '';
          const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
          if (/t="s"/.test(attrs)) {
            return shared[Number(v)] ?? '';
          }
          if (/t="inlineStr"/.test(attrs)) {
            return textsOf(body, 't').join('');
          }
          return decodeXml(v);
        });
        rows.push(cells.join('\t'));
        if (rows.length >= 500) {
          break;
        }
      }
      out.push(`Sheet ${i + 1}:\n` + rows.join('\n'));
    }
    return out.join('\n\n');
  }

  return (await read('content.xml'))
    .replace(/<text:(p|h)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((l) => decodeXml(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
