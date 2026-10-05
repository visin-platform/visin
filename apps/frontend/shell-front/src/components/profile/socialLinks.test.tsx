import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { describeLink } from './socialLinks';

describe('describeLink', () => {
  it.each([
    ['https://github.com/ann-lee', 'GitHub', 'ann-lee'],
    ['https://www.github.com/ann-lee/repo', 'GitHub', 'ann-lee'],
    ['https://gitlab.com/ann', 'GitLab', 'ann'],
    ['https://www.linkedin.com/in/ann-lee-123', 'LinkedIn', 'ann-lee-123'],
    ['https://orcid.org/0000-0002-1825-0097', 'ORCID', '0000-0002-1825-0097'],
    ['https://huggingface.co/ann-lee', 'Hugging Face', 'ann-lee'],
    ['https://www.kaggle.com/annlee', 'Kaggle', 'annlee'],
    ['https://x.com/annlee', 'X', 'annlee'],
    ['https://twitter.com/annlee', 'X', 'annlee'],
    ['https://bsky.app/profile/ann.bsky.social', 'Bluesky', 'ann.bsky.social'],
    ['https://www.youtube.com/@annlee', 'YouTube', '@annlee'],
    ['https://www.researchgate.net/profile/Ann-Lee', 'ResearchGate', 'Ann-Lee'],
  ])('knows %s as %s, by %s', (url, label, detail) => {
    expect(describeLink(url)).toMatchObject({ label, detail });
  });

  it('knows Google Scholar on any of its country domains, with no name to show', () => {
    for (const url of ['https://scholar.google.com/citations?user=AbC123xYz', 'https://scholar.google.co.uk/citations?user=AbC123xYz']) {
      const info = describeLink(url);
      expect(info.label).toBe('Google Scholar');
      expect(info.detail).toBeUndefined();
    }
    expect(describeLink('https://www.semanticscholar.org/author/Ann-Lee/123').label).toBe('Semantic Scholar');
  });

  it('shows a site of the person\'s own by its address', () => {
    expect(describeLink('https://ann.example.test/')).toMatchObject({ label: 'ann.example.test' });
    expect(describeLink('https://example.test/people/ann/')).toMatchObject({ label: 'example.test/people/ann' });
    expect(describeLink('https://ann.example.test/')).not.toHaveProperty('detail');
  });

  it('does not take a lookalike host for a platform', () => {
    expect(describeLink('https://github.com.evil.test/ann').label).toBe('github.com.evil.test/ann');
    expect(describeLink('https://notgithub.com/ann').label).toBe('notgithub.com/ann');
  });

  it('reads an encoded name and survives a broken one', () => {
    expect(describeLink('https://github.com/%E5%90%8D').detail).toBe('名');
    expect(describeLink('https://github.com/%E0%A4%A').detail).toBe('%E0%A4%A');
  });

  it('gives back what it cannot read as an address', () => {
    expect(describeLink('not a url').label).toBe('not a url');
  });

  it('draws an icon for each, platform or not', () => {
    for (const url of ['https://github.com/a', 'https://orcid.org/0000-0002-1825-0097', 'https://scholar.google.com/x', 'https://a.example.test']) {
      const { container } = render(<>{describeLink(url).icon}</>);
      expect(container.firstChild).not.toBeNull();
    }
  });
});
