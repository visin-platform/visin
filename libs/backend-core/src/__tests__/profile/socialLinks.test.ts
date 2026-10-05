import { expandLink, profileLinksSchema, MAX_PROFILE_LINKS } from '../../profile/socialLinks';

const url = (input: string) => {
  const result = expandLink(input);
  if (!result.ok) throw new Error(result.error);
  return result.url;
};
const error = (input: string) => {
  const result = expandLink(input);
  if (result.ok) throw new Error(`expected a refusal, got ${result.url}`);
  return result.error;
};

describe('expandLink', () => {
  it('keeps a full https address as it is', () => {
    expect(url('https://github.com/ann-lee')).toBe('https://github.com/ann-lee');
    expect(url('  HTTPS://Example.com/a?b=1#c ')).toBe('HTTPS://Example.com/a?b=1#c');
  });

  it.each([
    ['github:ann-lee', 'https://github.com/ann-lee'],
    ['gh:ann-lee', 'https://github.com/ann-lee'],
    ['GitHub:ann-lee', 'https://github.com/ann-lee'],
    ['gitlab:ann', 'https://gitlab.com/ann'],
    ['linkedin:ann-lee-123', 'https://www.linkedin.com/in/ann-lee-123'],
    ['orcid:0000-0002-1825-0097', 'https://orcid.org/0000-0002-1825-0097'],
    ['orcid:0000-0002-1694-233X', 'https://orcid.org/0000-0002-1694-233X'],
    ['scholar:AbC123_xYz-', 'https://scholar.google.com/citations?user=AbC123_xYz-'],
    ['hf:ann-lee', 'https://huggingface.co/ann-lee'],
    ['kaggle:annlee', 'https://www.kaggle.com/annlee'],
    ['x:annlee', 'https://x.com/annlee'],
    ['twitter:annlee', 'https://x.com/annlee'],
    ['bluesky:ann.bsky.social', 'https://bsky.app/profile/ann.bsky.social'],
    ['youtube:@annlee', 'https://www.youtube.com/@annlee'],
    ['youtube:annlee', 'https://www.youtube.com/@annlee'],
    ['researchgate:Ann-Lee', 'https://www.researchgate.net/profile/Ann-Lee'],
    ['mastodon:@ann@mastodon.social', 'https://mastodon.social/@ann']
  ])('turns %s into %s', (input, expected) => {
    expect(url(input)).toBe(expected);
  });

  it('gives a bare domain https://', () => {
    expect(url('ann.example.com')).toBe('https://ann.example.com');
    expect(url('example.org/papers?x=1')).toBe('https://example.org/papers?x=1');
  });

  it('says what a shorthand wants when its value is wrong', () => {
    expect(error('orcid:123')).toContain('ORCID iD like 0000-0002-1825-0097');
    expect(error('github:not a name')).toContain('a user name');
    expect(error('github:../evil')).toContain('a user name');
    expect(error('scholar:x')).toContain('Google Scholar');
    expect(error('bluesky:ann')).toContain('name.bsky.social');
    expect(error('mastodon:ann')).toContain('@name@mastodon.social');
  });

  it('refuses a platform it does not know, rather than guessing', () => {
    expect(error('myspace:tom')).toContain('not a shorthand Visin knows');
  });

  it('refuses every other scheme, in any case', () => {
    expect(error('javascript:alert(1)')).toContain('not a shorthand');
    expect(error('http://example.com')).toBe('Links must start with https://');
    expect(error('ftp://example.com')).toBe('Links must start with https://');
    expect(error('data://text/html,x')).toBe('Links must start with https://');
  });

  it('refuses what is neither an address nor a shorthand, and an empty line', () => {
    expect(error('just some words')).toContain('not a web address');
    expect(error('localhost')).toContain('not a web address');
    expect(error('   ')).toBe('A link cannot be empty');
  });
});

describe('profileLinksSchema', () => {
  it('turns what was typed into https addresses', () => {
    expect(profileLinksSchema.parse([' github:ann-lee ', 'ann.example.test', 'https://a.example.test'])).toEqual([
      'https://github.com/ann-lee',
      'https://ann.example.test',
      'https://a.example.test'
    ]);
  });

  it('says what is wrong with a line it cannot use', () => {
    const bad = profileLinksSchema.safeParse(['orcid:12']);
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain('ORCID iD');
    for (const link of ['javascript:alert(1)', 'http://a.example.test', 'ftp://a.example.test', 'data:text/html,x']) {
      expect(profileLinksSchema.safeParse([link]).success).toBe(false);
    }
  });

  it('keeps to eight, and to 300 characters a line', () => {
    expect(profileLinksSchema.safeParse(Array(MAX_PROFILE_LINKS).fill('a.example.test')).success).toBe(true);
    expect(profileLinksSchema.safeParse(Array(MAX_PROFILE_LINKS + 1).fill('a.example.test')).success).toBe(false);
    expect(profileLinksSchema.safeParse([`https://a.example.test/${'x'.repeat(300)}`]).success).toBe(false);
  });

  it('describes itself for the API docs, with the shorthands', () => {
    expect(profileLinksSchema.description).toContain('github:');
    expect(profileLinksSchema.description).toContain('orcid:');
  });
});
