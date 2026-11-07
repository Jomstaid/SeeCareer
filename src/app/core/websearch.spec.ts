import { needsWeb, parsePages, searchQuery } from './websearch';

describe('searching the web', () => {
  it('knows when a message needs a lookup', () => {
    expect(needsWeb('search the internet for the latest news about Davao')).toBe(true);
    expect(needsWeb('who is Jose Rizal?')).toBe(true);
    expect(needsWeb('make my cover letter shorter')).toBe(false);
  });

  it('keeps only the topic as the search words', () => {
    expect(searchQuery('please look up Jose Rizal on the internet')).toBe('Jose Rizal');
    expect(searchQuery('who is Rodrigo Duterte?')).toBe('Rodrigo Duterte');
  });

  it('reads Wikipedia answers, best match first, and drops empty pages', () => {
    const pages = parsePages({
      query: {
        pages: {
          '2': { index: 2, title: 'Second', extract: 'B'.repeat(80) },
          '1': { index: 1, title: 'First', extract: 'A'.repeat(80), fullurl: 'https://en.wikipedia.org/wiki/First' },
          '3': { index: 3, title: 'Empty', extract: '' },
        },
      },
    });
    expect(pages.map((p) => p.title)).toEqual(['First', 'Second']);
    expect(pages[0].url).toBe('https://en.wikipedia.org/wiki/First');
    expect(parsePages(undefined)).toEqual([]);
  });
});
