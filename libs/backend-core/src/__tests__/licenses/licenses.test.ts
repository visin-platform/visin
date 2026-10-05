import { KNOWN_LICENSE_IDS, LICENSES, licenseChoices, licenseSchema, licenseView } from '../../licenses/licenses';

describe('the licence table', () => {
  it('links every listed licence to its terms over https', () => {
    for (const id of KNOWN_LICENSE_IDS) {
      expect(LICENSES[id].url).toMatch(/^https:\/\//);
      expect(LICENSES[id].name).not.toBe('');
    }
  });

  it('marks exactly the non-commercial Creative Commons licences as forbidding commercial use', () => {
    const noncommercial = KNOWN_LICENSE_IDS.filter((id) => !LICENSES[id].commercial);
    expect(noncommercial.sort()).toEqual(['cc-by-nc-4.0', 'cc-by-nc-nd-4.0', 'cc-by-nc-sa-4.0']);
  });

  it('offers every listed licence once, then other', () => {
    const ids = licenseChoices().map((choice) => choice.id);
    expect(ids).toEqual([...KNOWN_LICENSE_IDS, 'other']);
  });

  it('views nothing as nothing, and other as the publisher wrote it', () => {
    expect(licenseView(undefined)).toBeUndefined();
    expect(licenseView({ id: 'other', name: 'Acme terms' })).toEqual({ id: 'other', name: 'Acme terms' });
    expect(licenseSchema.parse({ id: 'other', name: ' Acme ', url: 'http://acme.test/t' })).toEqual({
      id: 'other',
      name: 'Acme',
      url: 'http://acme.test/t'
    });
  });

  it('shows a listed licence with the name, link and commercial use the table gives its id', () => {
    expect(licenseView({ id: 'cc-by-nc-4.0' })).toEqual({
      id: 'cc-by-nc-4.0',
      name: 'CC BY-NC 4.0',
      url: 'https://creativecommons.org/licenses/by-nc/4.0/',
      commercial: false
    });
  });

  it('shows an undeclared licence as nothing', () => {
    expect(licenseView(undefined)).toBeUndefined();
  });

  it('shows the link an other licence was given with', () => {
    expect(licenseView({ id: 'other', name: 'Acme terms', url: 'https://acme.test/t' })).toEqual({
      id: 'other',
      name: 'Acme terms',
      url: 'https://acme.test/t'
    });
  });

  it('refuses what is not a licence declaration', () => {
    for (const bad of [
      { id: 'not-listed' },
      { id: 'other' },
      { id: 'other', name: '  ' },
      { id: 'other', name: 'X', url: 'not a link' },
      { id: 'other', name: 'X', url: 'javascript:alert(1)' },
      { id: 'other', name: 'X', url: 'https://user:pw@acme.test/terms' },
      { id: 'mit', name: 'Not MIT really' }
    ]) {
      expect(licenseSchema.safeParse(bad).success).toBe(false);
    }
  });
});
