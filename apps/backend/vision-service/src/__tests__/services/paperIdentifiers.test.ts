import { arxivLink, doiLink, parseArxivId, parseDoi, parseHttpUrl } from '../../services/paperIdentifiers';

describe('paper identifiers', () => {
  it.each([
    ['2401.01234', '2401.01234'],
    ['2401.01234v2', '2401.01234'],
    ['arXiv:2401.01234v10', '2401.01234'],
    ['ARXIV: 2401.01234', '2401.01234'],
    ['https://arxiv.org/abs/2401.01234', '2401.01234'],
    ['http://www.arxiv.org/abs/2401.01234v3?context=cs', '2401.01234'],
    ['https://arxiv.org/pdf/2401.01234v3.pdf', '2401.01234'],
    ['0704.0001', '0704.0001'],
    ['hep-th/9901001v1', 'hep-th/9901001'],
    ['math.GT/0309136', 'math.gt/0309136']
  ])('reads the arXiv id in %s', (input, expected) => {
    expect(parseArxivId(input)).toBe(expected);
  });

  it.each(['', 'night driving', '2401', '2401.1234567', 'https://example.test/abs/2401.01234', '10.1000/xyz'])('does not take %j for an arXiv id', (input) => {
    expect(parseArxivId(input)).toBeUndefined();
  });

  it.each([
    ['10.1000/XYZ.123', '10.1000/xyz.123'],
    ['doi:10.1000/xyz', '10.1000/xyz'],
    ['DOI: 10.1000/xyz', '10.1000/xyz'],
    ['https://doi.org/10.1000/xyz', '10.1000/xyz'],
    ['http://dx.doi.org/10.1000/a%2Fb', '10.1000/a/b']
  ])('reads the DOI in %s', (input, expected) => {
    expect(parseDoi(input)).toBe(expected);
  });

  it.each(['', '11.1000/xyz', '10.1/xyz', '10.1000/', '10.1000/%E0%A4%A', 'night driving'])('does not take %j for a DOI', (input) => {
    expect(parseDoi(input)).toBeUndefined();
  });

  it('keeps an http(s) address without a password, and nothing else', () => {
    expect(parseHttpUrl(' https://example.test/paper?x=1 ')).toBe('https://example.test/paper?x=1');
    expect(parseHttpUrl('http://example.test')).toBe('http://example.test/');
    for (const bad of ['', 'example.test', 'javascript:alert(1)', 'ftp://example.test/p.pdf', 'https://user:pw@example.test/', 'data:text/html,hi']) {
      expect(parseHttpUrl(bad)).toBeUndefined();
    }
  });

  it('builds the addresses an identifier stands for', () => {
    expect(arxivLink('2401.01234')).toBe('https://arxiv.org/abs/2401.01234');
    expect(doiLink('10.1000/xyz')).toBe('https://doi.org/10.1000/xyz');
  });
});
