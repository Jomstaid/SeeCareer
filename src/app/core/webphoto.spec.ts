import { isSearchableName, titleMatches } from './webphoto';

describe('finding a photo online', () => {
  it('accepts a page that is really about the person', () => {
    expect(titleMatches('Rodrigo Duterte', 'Rodrigo Duterte')).toBe(true);
    expect(titleMatches('rodrigo roa duterte', 'Rodrigo Duterte')).toBe(true);
    expect(titleMatches('José Rizal', 'Jose Rizal')).toBe(true);
  });

  it('rejects a page about something else', () => {
    expect(titleMatches('Jahn Paul', 'Paul McCartney')).toBe(false);
    expect(titleMatches('Maria Santos', 'Santos Dumont')).toBe(false);
  });

  it('does not search for placeholders or single words', () => {
    expect(isSearchableName('[Your Name]')).toBe(false);
    expect(isSearchableName('Madonna')).toBe(false);
    expect(isSearchableName('Rodrigo Duterte')).toBe(true);
  });
});
