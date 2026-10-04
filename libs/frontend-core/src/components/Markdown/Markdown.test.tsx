import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Markdown, MAX_MARKDOWN_LENGTH } from './Markdown';

const renderMarkdown = (source: string) => render(<Markdown>{source}</Markdown>);

describe('Markdown', () => {
  it('shows headings one level down, since the page has its own title', () => {
    renderMarkdown('# Results\n\n## Setup\n\n###### Deep');

    expect(screen.getByRole('heading', { level: 2, name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 6, name: 'Deep' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('shows paragraphs with emphasis, strong, strikethrough and inline code', () => {
    const { container } = renderMarkdown('A **bold** and *italic* and ~~gone~~ word with `code`.');

    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('del')).toHaveTextContent('gone');
    expect(container.querySelector('code')).toHaveTextContent('code');
  });

  it('keeps a hard line break inside a paragraph', () => {
    const { container } = renderMarkdown('first line  \nsecond line');

    expect(container.querySelector('br')).toBeInTheDocument();
    expect(container).toHaveTextContent('first linesecond line');
  });

  it('shows a fenced code block as it is, without reading Markdown in it', () => {
    const { container } = renderMarkdown('```python\nprint("**not bold**")\n```');

    const block = container.querySelector('pre')!;
    expect(block).toHaveTextContent('print("**not bold**")');
    expect(block.querySelector('strong')).toBeNull();
    // Reachable by keyboard: a long line scrolls.
    expect(block).toHaveAttribute('tabindex', '0');
  });

  it('shows lists, numbered ones from their first number, with lists inside them', () => {
    const { container } = renderMarkdown('- a\n  - nested\n- b\n\n3. three\n4. four');

    const lists = container.querySelectorAll('ul, ol');
    expect(lists).toHaveLength(3);
    expect(within(container.querySelector('ul')!).getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelector('ol')).toHaveAttribute('start', '3');
    expect(container.querySelector('ul ul')).toHaveTextContent('nested');
  });

  it('shows a quote and a rule', () => {
    const { container } = renderMarkdown('> quoted\n\n---');

    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('shows a table with its header, its rows and its alignment', () => {
    renderMarkdown('| Model | mIoU |\n| :-- | --: |\n| a | 0.8 |\n| b | 0.7 |');

    expect(screen.getByRole('columnheader', { name: 'Model' })).toHaveStyle({ textAlign: 'left' });
    expect(screen.getByRole('columnheader', { name: 'mIoU' })).toHaveStyle({ textAlign: 'right' });
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: '0.8' })).toHaveStyle({ textAlign: 'right' });
  });

  it('leaves a table column without alignment alone', () => {
    renderMarkdown('| a |\n| --- |\n| x |');

    expect(screen.getByRole('cell', { name: 'x' }).getAttribute('style')).toBeNull();
  });

  describe('links', () => {
    it('opens a web address in a new tab without a referrer, an opener or an endorsement', () => {
      renderMarkdown('[docs](https://example.test/docs) and https://example.test/bare and <mailto:a@example.test>');

      for (const name of ['docs', 'https://example.test/bare', 'mailto:a@example.test']) {
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
      }
    });

    it('keeps an in-page anchor and an app path in the same tab', () => {
      renderMarkdown('[up](#top) and [project](/projects/p1)');

      expect(screen.getByRole('link', { name: 'up' })).toHaveAttribute('href', '#top');
      expect(screen.getByRole('link', { name: 'up' })).not.toHaveAttribute('target');
      expect(screen.getByRole('link', { name: 'project' })).toHaveAttribute('href', '/projects/p1');
    });

    it('makes no link of a javascript: or data: address, and keeps its words', () => {
      const { container } = renderMarkdown('[click me](javascript:alert(1)) and [data](data:text/html,x)');

      expect(container.querySelector('a')).toBeNull();
      expect(container).toHaveTextContent('click me and data');
    });
  });

  describe('what a stranger could try', () => {
    it('shows raw HTML as the text it is: nothing is created from it', () => {
      const { container } = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(1)">x</a>');

      expect(container.querySelector('script, img, a')).toBeNull();
      expect(container).toHaveTextContent('<script>alert(1)</script>');
      expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
    });

    it('never loads an image: it shows its words and a link', () => {
      const { container } = renderMarkdown('![a tracking pixel](https://tracker.test/p.png) ![bad](javascript:alert(1))');

      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByRole('link', { name: 'a tracking pixel (image)' })).toHaveAttribute('href', 'https://tracker.test/p.png');
      expect(container).toHaveTextContent('bad');
    });

    it('shows no more than the limit, so one cannot hand every visitor a book', () => {
      renderMarkdown(`${'word '.repeat(MAX_MARKDOWN_LENGTH)}THE END`);

      expect(screen.queryByText(/THE END/)).not.toBeInTheDocument();
    });
  });

  it('shows nothing for nothing', () => {
    const { container } = renderMarkdown('');

    expect(container.textContent).toBe('');
  });

  it('shows what it was given again when the text changes', () => {
    const { container, rerender } = renderMarkdown('first');
    rerender(<Markdown>second</Markdown>);

    expect(container).toHaveTextContent('second');
    expect(container).not.toHaveTextContent('first');
  });
});
