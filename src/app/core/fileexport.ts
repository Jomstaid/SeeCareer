import { Capacitor } from '@capacitor/core';

import { ExportFormat } from './models';
import { clean } from './resumerender';

/** One line of a markdown document, simplified for export. */
interface Block {
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'p' | 'blank' | 'rule';
  text: string;
}

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF document',
  docx: 'Word document (.docx)',
  txt: 'Plain text (.txt)',
  md: 'Markdown (.md)',
};

/** Splits markdown into simple blocks (headings, bullets, paragraphs). */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of (markdown ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/```\w*/g, '').trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/[A-Za-z0-9]/.test(line)) {
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean);
        blocks.push({ type: 'p', text: cells.join('   |   ') });
      }
      continue;
    }
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      blocks.push({ type: 'blank', text: '' });
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule', text: '' });
    } else if ((m = /^#\s+(.*)/.exec(line))) {
      blocks.push({ type: 'h1', text: m[1] });
    } else if ((m = /^##\s+(.*)/.exec(line))) {
      blocks.push({ type: 'h2', text: m[1] });
    } else if ((m = /^#{3,6}\s+(.*)/.exec(line))) {
      blocks.push({ type: 'h3', text: m[1] });
    } else if ((m = /^\s*[-*•]\s+(.*)/.exec(line))) {
      blocks.push({ type: 'bullet', text: m[1] });
    } else if ((m = /^\s*(\d+[.)])\s+(.*)/.exec(line))) {
      blocks.push({ type: 'number', text: `${m[1]} ${m[2]}` });
    } else {
      blocks.push({ type: 'p', text: line.trim() });
    }
  }
  return blocks;
}

/** Removes markdown symbols (**bold**, `code`, [links](url)). */
export function plain(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

/** A readable file name: words separated by single spaces, with no hyphens, underscores or other symbols. */
export function safeFileName(title: string): string {
  const base = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // symbols, hyphens and underscores become spaces
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
    .trim();
  return base || 'SeeCareer';
}

// ---------- builders ----------
async function buildPdf(title: string, markdown: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 58;
  const width = W - margin * 2;
  const top = 64;
  const bottom = H - 70;
  const accent: [number, number, number] = [3, 105, 161];
  const ink: [number, number, number] = [31, 41, 55];
  const body: [number, number, number] = [55, 65, 81];
  const gray: [number, number, number] = [107, 114, 128];
  let y = top;

  const need = (h: number) => {
    if (y + h > bottom) {
      doc.addPage();
      y = top;
    }
  };

  const write = (text: string, size: number, style: 'normal' | 'bold', color: [number, number, number], indent = 0, gap = 4, lh = 1.5) => {
    const value = clean(plain(text));
    if (!value) {
      return;
    }
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(value, width - indent) as string[]) {
      need(size * lh);
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.text(line, margin + indent, y + size);
      y += size * lh;
    }
    y += gap;
  };

  let first = true;
  for (const b of parseBlocks(markdown)) {
    switch (b.type) {
      case 'h1':
        write(b.text, first ? 25 : 18, 'bold', ink, 0, 4, 1.25);
        doc.setFillColor(...accent);
        doc.rect(margin, y, 46, 3, 'F');
        y += 16;
        break;
      case 'h2':
        y += 8;
        need(40);
        write(b.text, 13.5, 'bold', accent, 0, 2, 1.3);
        doc.setDrawColor(220, 225, 232);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin + width, y);
        y += 8;
        break;
      case 'h3':
        y += 4;
        write(b.text, 11.8, 'bold', ink, 0, 2, 1.35);
        break;
      case 'bullet': {
        const value = clean(plain(b.text));
        if (!value) {
          break;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.8);
        const lines = doc.splitTextToSize(value, width - 16) as string[];
        lines.forEach((line, i) => {
          need(10.8 * 1.5);
          if (i === 0) {
            doc.setFillColor(...accent);
            doc.circle(margin + 4, y + 7.6, 1.7, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.8);
          doc.setTextColor(...body);
          doc.text(line, margin + 16, y + 10.8);
          y += 10.8 * 1.5;
        });
        y += 2;
        break;
      }
      case 'number': {
        const m = /^(\d+[.)])\s+(.*)$/.exec(b.text);
        const label = m ? m[1] : '';
        const value = clean(plain(m ? m[2] : b.text));
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.8);
        const lines = doc.splitTextToSize(value, width - 22) as string[];
        lines.forEach((line, i) => {
          need(10.8 * 1.5);
          if (i === 0 && label) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...accent);
            doc.text(label, margin, y + 10.8);
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.8);
          doc.setTextColor(...body);
          doc.text(line, margin + 22, y + 10.8);
          y += 10.8 * 1.5;
        });
        y += 2;
        break;
      }
      case 'rule':
        need(14);
        doc.setDrawColor(220, 225, 232);
        doc.setLineWidth(0.8);
        doc.line(margin, y + 6, margin + width, y + 6);
        y += 16;
        break;
      case 'blank':
        y += 4;
        break;
      default:
        write(b.text, 10.8, 'normal', body, 0, 5);
    }
    if (b.type !== 'blank') {
      first = false;
    }
  }

  // footer on every page: the title and "Page 1 of 3"
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 231, 236);
    doc.setLineWidth(0.6);
    doc.line(margin, H - 48, W - margin, H - 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gray);
    doc.text(clean(title).slice(0, 70), margin, H - 34);
    doc.text(`Page ${i} of ${pages}`, W - margin, H - 34, { align: 'right' });
  }
  doc.setProperties({ title: clean(title), creator: 'SeeCareer' });
  return doc.output('blob');
}

async function buildDocx(title: string, markdown: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = await import('docx');
  const runs = (text: string, size = 22) =>
    text
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((part) =>
        part.startsWith('**') && part.endsWith('**')
          ? new TextRun({ text: plain(part.slice(2, -2)), bold: true, size })
          : new TextRun({ text: plain(part), size }),
      );
  const children = parseBlocks(markdown)
    .filter((b) => b.type !== 'blank')
    .map((b) => {
      switch (b.type) {
        case 'h1':
          return new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: plain(b.text), bold: true, size: 40 })] });
        case 'h2':
          return new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '6366F1', space: 2 } },
            children: [new TextRun({ text: plain(b.text).toUpperCase(), bold: true, size: 26, color: '312E81' })],
          });
        case 'h3':
          return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: plain(b.text), bold: true, size: 23 })] });
        case 'bullet':
          return new Paragraph({ bullet: { level: 0 }, children: runs(b.text) });
        case 'rule':
          return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } } });
        default:
          return new Paragraph({ spacing: { after: 80 }, children: runs(b.text) });
      }
    });
  const doc = new Document({ creator: 'SeeCareer', title, sections: [{ children }] });
  return Packer.toBlob(doc);
}

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

export async function buildFile(format: ExportFormat, title: string, markdown: string): Promise<Blob> {
  switch (format) {
    case 'pdf':
      return buildPdf(title, markdown);
    case 'docx':
      return buildDocx(title, markdown);
    case 'txt':
      return new Blob([parseBlocks(markdown).map((b) => (b.type === 'bullet' ? '• ' : '') + plain(b.text)).join('\n')], {
        type: MIME.txt,
      });
    default:
      return new Blob([markdown], { type: MIME.md });
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Creates the file and gives it to the user.
 * Browser: normal download. Phone: the file is created, then the share sheet opens (save to Files/Drive, send, print...).
 * Returns where the file went.
 */
export async function exportFile(format: ExportFormat, title: string, markdown: string): Promise<string> {
  const blob = await buildFile(format, title, markdown);
  return deliverBlob(blob, `${safeFileName(title)}.${format}`);
}

/** Gives a finished file to the user: a download in the browser, the share sheet on the phone. */
export async function deliverBlob(blob: Blob, name: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const saved = await Filesystem.writeFile({
      path: name,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({ title: name, url: saved.uri, dialogTitle: 'Save or share your file' });
    } catch {
      /* user closed the share sheet: the file is still saved */
    }
    return `Created ${name}`;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return `Downloaded ${name}`;
}
