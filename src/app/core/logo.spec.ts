import { domainFromText, domainGuesses, faviconUrl, logoCandidates } from './logo';

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

describe('the website named in a job text', () => {
  it('picks a link whose address contains the company name', () => {
    const html = '<p>Apply at https://www.calabrio.com/careers or see https://www.linkedin.com/company/calabrio and https://boards.greenhouse.io/calabrio</p>';
    expect(domainFromText(html, 'Calabrio')).toBe('calabrio.com');
    expect(domainFromText('see https://remoteok.com/remote-jobs/x', 'StaffRight')).toBeNull();
    expect(domainFromText('https://www.staffright.co.uk/jobs', 'StaffRight, Inc.')).toBe('staffright.co.uk');
  });

  it('puts a sure address before the guesses', () => {
    const list = logoCandidates('Calabrio', 'visit calabrio.com https://www.calabrio.com/');
    expect(list[0]).toEqual({ domain: 'calabrio.com', sure: true });
    expect(list.some((c) => !c.sure)).toBe(true);
    expect(logoCandidates('Calabrio', '')[0].sure).toBe(false);
  });
});
