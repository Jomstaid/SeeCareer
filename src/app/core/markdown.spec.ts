import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('escapes HTML so scripts cannot run', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('renders bold, inline code and lists', () => {
    const html = renderMarkdown('**Hi** `x`\n- a\n- b');
    expect(html).toContain('<strong>Hi</strong>');
    expect(html).toContain('<code>x</code>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
  });

  it('renders code blocks', () => {
    expect(renderMarkdown('```\nlet a = 1;\n```')).toContain('<pre><code>let a = 1;</code></pre>');
  });
});

describe('italic text', () => {
  it('turns *stars* and _underscores_ into emphasis, not visible symbols', () => {
    expect(renderMarkdown('Here are a few things I *can* do')).toContain('<em>can</em>');
    expect(renderMarkdown('_The fit % is my estimate._')).toContain('<em>The fit % is my estimate.</em>');
    expect(renderMarkdown('**bold** and *italic*')).toBe('<p><strong>bold</strong> and <em>italic</em></p>');
  });

  it('leaves list stars, snake_case words and lone symbols alone', () => {
    expect(renderMarkdown('* one\n* two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderMarkdown('use my_file_name here')).toContain('my_file_name');
    expect(renderMarkdown('2 * 3 * 4')).toContain('2 * 3 * 4');
  });
});
