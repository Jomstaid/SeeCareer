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
