import { Capacitor } from '@capacitor/core';

import { ExportFormat } from './models';

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
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

export function safeFileName(title: string): string {
  const base = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
  return base || 'SeeCareer';
}

// ---------- builders ----------
async function buildPdf(title: string, markdown: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 54;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  const write = (text: string, size: number, style: 'normal' | 'bold', indent = 0, gapAfter = 4) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(plain(text), width - indent) as string[];
    for (const line of lines) {
      if (y + size > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y + size);
      y += size * 1.35;
    }
    y += gapAfter;
  };

  for (const b of parseBlocks(markdown)) {
    switch (b.type) {
      case 'h1':
        write(b.text, 22, 'bold', 0, 2);
        break;
      case 'h2':
        y += 6;
        write(b.text.toUpperCase(), 12.5, 'bold', 0, 0);
        doc.setDrawColor(99, 102, 241);
        doc.setLineWidth(1);
        doc.line(margin, y, margin + width, y);
        y += 8;
        break;
      case 'h3':
        write(b.text, 11.5, 'bold', 0, 2);
        break;
      case 'bullet':
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        if (y + 10.5 > bottom) {
          doc.addPage();
          y = margin;
        }
        doc.text('•', margin + 4, y + 10.5);
        write(b.text, 10.5, 'normal', 16, 1);
        break;
      case 'number':
        write(b.text, 10.5, 'normal', 8, 1);
        break;
      case 'rule':
        doc.setDrawColor(200);
        doc.line(margin, y + 4, margin + width, y + 4);
        y += 12;
        break;
      case 'blank':
        y += 5;
        break;
      default:
        write(b.text, 10.5, 'normal', 0, 3);
    }
  }
  doc.setProperties({ title, creator: 'SeeCareer' });
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
  const name = `${safeFileName(title)}.${format}`;

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
