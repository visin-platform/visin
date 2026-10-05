import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageMeta, usePageMeta } from './usePageMeta';

const Page = ({ meta }: { meta: PageMeta | null }) => {
  usePageMeta(meta);
  return null;
};

const renderAt = (meta: PageMeta | null, path = '/u/ann-lee?utm=x#top') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Page meta={meta} />
    </MemoryRouter>
  );

const content = (selector: string) => document.head.querySelector(selector)?.getAttribute('content');

describe('usePageMeta', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<title>Visin</title><meta name="description" content="The shell"><meta property="og:title" content="Visin">';
  });
  afterEach(() => {
    // Unmount first, so each hook puts its tags back before the head is thrown away.
    cleanup();
    document.head.innerHTML = '';
  });

  it('gives the page its title, description and a canonical address without query or fragment', () => {
    renderAt({ title: 'Ann Lee on Visin', description: 'Segmentation' });

    expect(document.title).toBe('Ann Lee on Visin');
    expect(content('meta[name="description"]')).toBe('Segmentation');
    expect(content('meta[property="og:title"]')).toBe('Ann Lee on Visin');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${window.location.origin}/u/ann-lee`
    );
  });

  it('changes the tags the shell already has instead of adding a second description', () => {
    renderAt({ title: 'Ann Lee on Visin', description: 'Segmentation' });

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
  });

  it('puts the shell head back when the page goes', () => {
    const { unmount } = renderAt({ title: 'Ann Lee on Visin', description: 'Segmentation', noindex: true });
    expect(content('meta[name="robots"]')).toBe('noindex');

    unmount();

    expect(document.title).toBe('Visin');
    expect(content('meta[name="description"]')).toBe('The shell');
    expect(content('meta[property="og:title"]')).toBe('Visin');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('leaves the head alone until the page is known', () => {
    renderAt(null);

    expect(document.title).toBe('Visin');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
