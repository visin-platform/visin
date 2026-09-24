import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CopyButton from './CopyButton';
import CodeBlock from './CodeBlock';
import CodeTabs from './CodeTabs';
import InlineCode from './InlineCode';
import CodeLanguageProvider from './CodeLanguageProvider';
import DocLink from './DocLink';
import Callout from './Callout';
import DocTable from './DocTable';
import DocsSidebar from './DocsSidebar';
import Outline from './Outline';
import { H2, H3 } from './Heading';
import { CODE_LANGUAGE_KEY, languageLabel, useCodeLanguage } from '../codeLanguage';
import { slugify, textOf } from '../slug';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const pre = (language: string | undefined, text: string, title?: string) => (
  <CodeBlock data-language={language} data-title={title} className="shiki" style={{ background: 'black' }}>
    <code>{text}</code>
  </CodeBlock>
);

describe('CopyButton', () => {
  it('copies the code as shown, confirms, then offers to copy again', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const target = createRef<HTMLPreElement>();
    render(
      <>
        <pre ref={target}>print(1)</pre>
        <CopyButton target={target} />
      </>
    );

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })));
    expect(writeText).toHaveBeenCalledWith('print(1)');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('selects the code where there is no clipboard, so Ctrl+C finishes the job', async () => {
    vi.stubGlobal('navigator', {});
    const selectAllChildren = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({ selectAllChildren } as unknown as Selection);
    const target = createRef<HTMLPreElement>();
    render(
      <>
        <pre ref={target}>ls</pre>
        <CopyButton target={target} />
      </>
    );

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })));
    expect(selectAllChildren).toHaveBeenCalledWith(target.current);
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('does nothing before its code is on the page', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton target={createRef<HTMLElement>()} />);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy code' })));
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('CodeBlock', () => {
  it('labels a block by its title, else its language', () => {
    render(
      <>
        {pre('python', 'a', 'train.py')}
        {pre('bash', 'b')}
        {pre(undefined, 'c')}
      </>
    );

    expect(screen.getByText('train.py')).toBeInTheDocument();
    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy code' })).toHaveLength(3);
  });

  it('keeps code inside a block plain, and styles code in a sentence', () => {
    render(
      <>
        <CodeBlock data-language="python">
          <InlineCode>in_block</InlineCode>
        </CodeBlock>
        <p>
          <InlineCode>in_prose</InlineCode>
        </p>
      </>
    );

    expect(screen.getByText('in_block').className).toBe('');
    expect(screen.getByText('in_prose').className).not.toBe('');
  });
});

const Picked = () => <span data-testid="picked">{useCodeLanguage().language ?? 'none'}</span>;

describe('CodeTabs', () => {
  it('shows one language at a time, named by title or language, and remembers the pick', () => {
    render(
      <CodeLanguageProvider>
        <CodeTabs>
          <>{pre('python', 'py code')}</>
          {'\n'}
          {pre('bash', 'curl code', 'curl')}
        </CodeTabs>
        <Picked />
      </CodeLanguageProvider>
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Python', 'curl']);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('py code');
    // One header for the set, not one per block.
    expect(screen.getAllByRole('button', { name: 'Copy code' })).toHaveLength(1);

    fireEvent.click(tabs[1]);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('curl code');
    expect(screen.getByTestId('picked')).toHaveTextContent('bash');
    expect(window.localStorage.getItem(CODE_LANGUAGE_KEY)).toBe('bash');
  });

  it('shows the first tab when the remembered language is not offered', () => {
    window.localStorage.setItem(CODE_LANGUAGE_KEY, 'rust');
    render(
      <CodeLanguageProvider>
        <CodeTabs>
          {pre('python', 'py code')}
          {pre(undefined, 'plain')}
        </CodeTabs>
      </CodeLanguageProvider>
    );

    expect(screen.getByRole('tabpanel')).toHaveTextContent('py code');
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('plain');
  });

  it('still switches with no provider, without remembering', () => {
    render(
      <CodeTabs>
        {pre('python', 'py code')}
        {pre('bash', 'sh code')}
      </CodeTabs>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Shell' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('py code');
  });
});

describe('CodeLanguageProvider', () => {
  it('starts with no choice when storage is blocked, and still takes one', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <CodeLanguageProvider>
        <CodeTabs>
          {pre('python', 'py code')}
          {pre('bash', 'sh code')}
        </CodeTabs>
        <Picked />
      </CodeLanguageProvider>
    );

    expect(screen.getByTestId('picked')).toHaveTextContent('none');
    fireEvent.click(screen.getByRole('tab', { name: 'Shell' }));
    expect(screen.getByTestId('picked')).toHaveTextContent('bash');
  });
});

describe('DocLink', () => {
  const inRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

  it('opens another docs page in place', () => {
    inRouter(<DocLink href="/docs/quickstart">Quickstart</DocLink>);

    const link = screen.getByRole('link', { name: 'Quickstart' });
    expect(link).toHaveAttribute('href', '/docs/quickstart');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens an off-site link in a new tab, safely', () => {
    inRouter(<DocLink href="https://example.com/x">Out</DocLink>);

    const link = screen.getByRole('link', { name: 'Out' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('leaves in-page, landing and API reference links as plain links', () => {
    inRouter(
      <>
        <DocLink href="/docs/api">Reference</DocLink>
        <DocLink href="#scopes">Scopes</DocLink>
        <DocLink href="/#assistant">Assistant</DocLink>
        <DocLink>Nowhere</DocLink>
      </>
    );

    expect(screen.getByRole('link', { name: 'Scopes' })).toHaveAttribute('href', '#scopes');
    expect(screen.getByRole('link', { name: 'Reference' })).toHaveAttribute('href', '/docs/api');
    expect(screen.getByRole('link', { name: 'Assistant' })).not.toHaveAttribute('target');
  });
});

describe('Callout and DocTable', () => {
  it('shows a titled warning and an untitled note', () => {
    render(
      <>
        <Callout kind="warning" title="Copy it now">
          Shown once.
        </Callout>
        <Callout>Just so you know.</Callout>
      </>
    );

    const [warning, note] = screen.getAllByRole('alert');
    expect(within(warning).getByText('Copy it now')).toBeInTheDocument();
    expect(note).toHaveTextContent('Just so you know.');
  });

  it('renders a table in a box that scrolls on its own', () => {
    render(
      <DocTable>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </DocTable>
    );

    expect(screen.getByRole('table')).toHaveTextContent('cell');
  });
});

describe('headings', () => {
  it('anchors a section by its words, markup and all', () => {
    render(
      <>
        <H2>
          Send <code>results</code>, run 2
        </H2>
        <H3>Scopes</H3>
      </>
    );

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'send-results-run-2');
    expect(heading).toHaveAttribute('data-outline', 'Send results, run 2');
    expect(within(heading).getByRole('link')).toHaveAttribute('href', '#send-results-run-2');
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute('id', 'scopes');
  });

  it('reads text from strings, numbers, lists and elements, and nothing from the rest', () => {
    expect(textOf(['a', 1, <b key="b">c</b>, null, false])).toBe('a1c');
    expect(slugify('  What a 401 means!  ')).toBe('what-a-401-means');
  });

  it('names languages it knows, and passes the rest through', () => {
    expect(languageLabel('python')).toBe('Python');
    expect(languageLabel('rust')).toBe('rust');
    expect(languageLabel()).toBe('Code');
  });
});

describe('DocsSidebar', () => {
  // The drawer unmounts after its close transition, so closure is awaited.
  const expectDrawerClosed = () => waitFor(() => expect(screen.queryByRole('presentation')).not.toBeInTheDocument());

  it('opens a drawer on a phone, and closes it once a page is chosen', async () => {
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsSidebar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Docs menu' }));
    const drawer = within(screen.getByRole('presentation'));
    fireEvent.click(drawer.getByRole('link', { name: 'Authentication' }));
    await expectDrawerClosed();
  });

  it('closes the drawer on Escape', async () => {
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsSidebar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Docs menu' }));
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape', code: 'Escape' });
    await expectDrawerClosed();
  });
});

describe('Outline', () => {
  it('shows nothing on a page without sections', () => {
    const { container } = render(
      <article>
        <p>No sections.</p>
        <Outline pageKey="a" />
      </article>
    );

    expect(container.querySelector('nav')).toBeNull();
  });

  it('marks the section being read as the page scrolls', () => {
    let notify: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    const { unmount } = render(
      <>
        <article>
          <H2>First</H2>
          <H3>Detail</H3>
        </article>
        <Outline pageKey="a" />
      </>
    );

    const outline = within(screen.getByRole('navigation', { name: 'On this page' }));
    const detail = document.getElementById('detail')!;
    act(() =>
      notify(
        [{ isIntersecting: false, target: detail } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(outline.getByRole('link', { name: 'Detail' })).not.toHaveAttribute('aria-current');

    act(() =>
      notify(
        [{ isIntersecting: true, target: detail } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(outline.getByRole('link', { name: 'Detail' })).toHaveAttribute('aria-current', 'location');
    expect(outline.getByRole('link', { name: 'First' })).not.toHaveAttribute('aria-current');

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
