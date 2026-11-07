import { placeFromName, splitPlace } from './places';

describe('places in a job request', () => {
  it('finds the country and keeps only the job words', () => {
    expect(splitPlace('find me backend developer jobs in the Philippines')).toEqual({ query: 'backend developer', place: { label: 'Philippines', code: 'PH' } });
    expect(splitPlace('graphic designer in Manila').place?.code).toBe('PH');
    expect(splitPlace('react developer, remote, from Canada').place?.code).toBe('CA');
  });

  it('does not take short words as a place unless they follow "in" or "from"', () => {
    expect(splitPlace('tell us about jobs').place).toBeNull();
    expect(splitPlace('developer jobs in US').place?.code).toBe('US');
  });

  it('leaves a request with no place alone', () => {
    expect(splitPlace('python developer')).toEqual({ query: 'python developer', place: null });
  });

  it('understands names and codes the AI gives', () => {
    expect(placeFromName('', 'ph')?.label).toBe('Philippines');
    expect(placeFromName('Cebu, Philippines')?.code).toBe('PH');
    expect(placeFromName('')).toBeNull();
  });
});

describe('the city a user names', () => {
  it('keeps the city next to the country', () => {
    expect(splitPlace('graphic design jobs near nueva ecija').place).toEqual({ label: 'Philippines', code: 'PH', city: 'Nueva Ecija' });
    expect(splitPlace('jobs in the Philippines').place?.city).toBeUndefined();
    expect(placeFromName('Nueva Ecija, Philippines', 'PH')?.city).toBe('Nueva Ecija');
  });
});
