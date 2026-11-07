import { parseBlocks, plain, safeFileName } from './fileexport';

describe('file export helpers', () => {
  it('splits markdown into headings, bullets and paragraphs', () => {
    const blocks = parseBlocks('# Juan\n## Skills\n- Angular\nHello');
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'bullet', 'p']);
  });

  it('removes markdown symbols and makes safe file names', () => {
    expect(plain('**Bold** `code`')).toBe('Bold code');
    expect(safeFileName('Juan Dela Cruz Resume!')).toBe('Juan Dela Cruz Resume');
    expect(safeFileName('juan_dela-cruz  cover_letter')).toBe('juan dela cruz cover letter');
    expect(safeFileName('---')).toBe('SeeCareer');
  });
});
