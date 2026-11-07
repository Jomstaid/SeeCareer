import { domainGuesses, faviconUrl } from './logo';

describe('company logo lookup', () => {
  it('uses the name as the address when it already looks like one', () => {
    expect(domainGuesses('Silver.dev')).toEqual(['silver.dev']);
    expect(domainGuesses('Lemon.io')).toEqual(['lemon.io']);
  });

  it('guesses addresses from a plain company name', () => {
    expect(domainGuesses('Thumbtack')[0]).toBe('thumbtack.com');
    expect(domainGuesses('Serve Robotics, Inc.')[0]).toBe('serverobotics.com');
    expect(domainGuesses('CivilGrid').length).toBe(5);
  });

  it('gives up on names that are too short to search', () => {
    expect(domainGuesses('')).toEqual([]);
    expect(domainGuesses('A')).toEqual([]);
  });

  it('builds the favicon address', () => {
    expect(faviconUrl('toptal.com')).toBe('https://www.google.com/s2/favicons?domain=toptal.com&sz=128');
  });
});
