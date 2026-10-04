import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, safeHref, type Block, type Inline } from './parse';

const text = (value: string): Inline => ({ type: 'text', text: value });
const paragraph = (...children: Inline[]): Block => ({ type: 'paragraph', children });

describe('safeHref', () => {
  it.each(['https://example.test/a?b=1', 'http://example.test', 'HTTPS://EXAMPLE.TEST', 'mailto:a@example.test', '#section', '/projects/p1'])(
    'lets %s be a link',
    (href) => {
      expect(safeHref(href)).toBe(href);
    }
  );

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.test/x', 'file:///etc/passwd', 'relative/path', '', 'ftp://x.test'])(
    'does not let %j be one',
    (href) => {
      expect(safeHref(href)).toBeNull();
    }
  );

  it('trims the address', () => {
    expect(safeHref('  https://example.test  ')).toBe('https://example.test');
  });
});

describe('parseInline', () => {
  it('reads plain text, with a line break inside a paragraph as a space', () => {
    expect(parseInline('one\ntwo')).toEqual([text('one two')]);
  });

  it('reads emphasis, strong, strikethrough and code, nested', () => {
    expect(parseInline('a **bold *and italic*** b ~~gone~~ `x < y`')).toEqual([
      text('a '),
      { type: 'strong', children: [text('bold '), { type: 'em', children: [text('and italic')] }] },
      text(' b '),
      { type: 'del', children: [text('gone')] },
      text(' '),
      { type: 'code', text: 'x < y' }
    ]);
  });

  it('does not take snake_case or a lone star for emphasis', () => {
    expect(parseInline('use my_function_name and 2 * 3 * 4')).toEqual([text('use my_function_name and 2 * 3 * 4')]);
    expect(parseInline('_italic_ and __strong__')).toEqual([
      { type: 'em', children: [text('italic')] },
      text(' and '),
      { type: 'strong', children: [text('strong')] }
    ]);
  });

  it('reads links, with their text read as Markdown, and a title ignored', () => {
    expect(parseInline('see [the **docs**](https://example.test/docs "Docs") now')).toEqual([
      text('see '),
      { type: 'link', href: 'https://example.test/docs', children: [text('the '), { type: 'strong', children: [text('docs')] }] },
      text(' now')
    ]);
  });

  it('links a bare address and an <autolink>, without the punctuation that ends the sentence', () => {
    expect(parseInline('Visit https://example.test/a, then <https://example.test/b>.')).toEqual([
      text('Visit '),
      { type: 'link', href: 'https://example.test/a', children: [text('https://example.test/a')] },
      text(', then '),
      { type: 'link', href: 'https://example.test/b', children: [text('https://example.test/b')] },
      text('.')
    ]);
  });

  it('keeps the words of a link whose address is not allowed, and drops the address', () => {
    expect(parseInline('[click](javascript:alert(1))x')).toEqual([{ type: 'link', href: null, children: [text('click')] }, text('x')]);
    expect(parseInline('[click](data:text/html,x)')).toEqual([{ type: 'link', href: null, children: [text('click')] }]);
  });

  it('never loads an image: it is its words and, where allowed, an address', () => {
    expect(parseInline('![chart](https://tracker.test/pixel.png)')).toEqual([{ type: 'image', alt: 'chart', href: 'https://tracker.test/pixel.png' }]);
    expect(parseInline('![x](javascript:alert(1))')).toEqual([{ type: 'image', alt: 'x', href: null }]);
  });

  it('shows raw HTML as the text it is', () => {
    expect(parseInline('<script>alert(1)</script> <img src=x onerror=alert(1)>')).toEqual([
      text('<script>alert(1)</script> <img src=x onerror=alert(1)>')
    ]);
  });

  it('reads a backslash escape as the character, and a hard break', () => {
    expect(parseInline('\\*not italic\\* and \\[not a link\\](x)')).toEqual([text('*not italic* and [not a link](x)')]);
    expect(parseInline('one  \ntwo')).toEqual([text('one'), { type: 'br' }, text('two')]);
    expect(parseInline('one\\\ntwo')).toEqual([text('one'), { type: 'br' }, text('two')]);
  });

  it('keeps an unclosed marker as text', () => {
    expect(parseInline('**never closed and `neither')).toEqual([text('**never closed and `neither')]);
  });

  it('strips one space of padding from a code span', () => {
    expect(parseInline('`` a`b ``')).toEqual([{ type: 'code', text: 'a`b' }]);
  });

  it('stops nesting at a depth, so a hostile source cannot recurse without end', () => {
    const nested = '**'.repeat(1) + '*a ' + '**b '.repeat(20) + 'c' + ' b**'.repeat(20) + ' a*' + '**';
    expect(() => parseInline(nested)).not.toThrow();
  });

  it('takes no time over a page of unclosed markers (it is read by every visitor)', () => {
    const started = Date.now();
    for (const marker of ['*', '**', '_', '~~', '`', '``', '[', '![', '[a](', '**a ', '`a ', '\\*', 'https://x.test/', '<https://x.test/', '*a_']) {
      parseInline(marker.repeat(Math.ceil(20_000 / marker.length)));
      parseInline(marker.repeat(Math.ceil(4_000 / marker.length)));
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('parseBlocks', () => {
  it('reads headings, and a closing run of # as nothing', () => {
    expect(parseBlocks('# One\n\n### Three ###\n####### seven')).toEqual([
      { type: 'heading', level: 1, children: [text('One')] },
      { type: 'heading', level: 3, children: [text('Three')] },
      paragraph(text('####### seven'))
    ]);
  });

  it('reads paragraphs separated by blank lines, and a line break inside one as a space', () => {
    expect(parseBlocks('first line\nsecond line\n\nanother')).toEqual([paragraph(text('first line second line')), paragraph(text('another'))]);
  });

  it('reads a fenced code block as it is, whatever it contains, with its language', () => {
    expect(parseBlocks('```python\nprint("**not bold**")\n# not a heading\n```\nafter')).toEqual([
      { type: 'code', lang: 'python', text: 'print("**not bold**")\n# not a heading' },
      paragraph(text('after'))
    ]);
  });

  it('runs an unclosed fence to the end, and needs the closing fence to be as long', () => {
    expect(parseBlocks('````\n```\nstill code\n````')).toEqual([{ type: 'code', lang: '', text: '```\nstill code' }]);
    expect(parseBlocks('```\nnever closed')).toEqual([{ type: 'code', lang: '', text: 'never closed' }]);
    expect(parseBlocks('~~~\ntilde\n~~~')).toEqual([{ type: 'code', lang: '', text: 'tilde' }]);
  });

  it('reads rules', () => {
    expect(parseBlocks('---\n***\n_ _ _')).toEqual([{ type: 'hr' }, { type: 'hr' }, { type: 'hr' }]);
  });

  it('reads a quote, with Markdown inside it', () => {
    expect(parseBlocks('> a **quote**\n> over two lines\n\nafter')).toEqual([
      { type: 'quote', children: [paragraph(text('a '), { type: 'strong', children: [text('quote')] }, text(' over two lines'))] },
      paragraph(text('after'))
    ]);
  });

  it('reads bullet and numbered lists, the numbered one from its first number', () => {
    expect(parseBlocks('- a\n- b\n\n3. three\n4. four')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [[paragraph(text('a'))], [paragraph(text('b'))]] },
      { type: 'list', ordered: true, start: 3, items: [[paragraph(text('three'))], [paragraph(text('four'))]] }
    ]);
  });

  it('reads a list inside a list, and the continuation of an item', () => {
    expect(parseBlocks('- parent\n  continues here\n  - child one\n  - child two\n- next')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [
            paragraph(text('parent continues here')),
            { type: 'list', ordered: false, start: 1, items: [[paragraph(text('child one'))], [paragraph(text('child two'))]] }
          ],
          [paragraph(text('next'))]
        ]
      }
    ]);
  });

  it('keeps a list going over a blank line when the next item follows', () => {
    const [list] = parseBlocks('- a\n\n- b') as Extract<Block, { type: 'list' }>[];

    expect(list.items).toHaveLength(2);
  });

  it('lets a list interrupt a paragraph, and ends it at the next paragraph', () => {
    expect(parseBlocks('intro\n- a\n\nafter')).toEqual([
      paragraph(text('intro')),
      { type: 'list', ordered: false, start: 1, items: [[paragraph(text('a'))]] },
      paragraph(text('after'))
    ]);
  });

  it('reads a table with its alignment, padding short rows and cutting long ones', () => {
    const [table] = parseBlocks('| Model | mIoU | Time |\n| :--- | ---: | :---: |\n| a | 0.8 | 3 |\n| b |\n| c | 1 | 2 | 3 |') as Extract<Block, { type: 'table' }>[];

    expect(table.align).toEqual(['left', 'right', 'center']);
    expect(table.head).toEqual([[text('Model')], [text('mIoU')], [text('Time')]]);
    expect(table.rows).toEqual([
      [[text('a')], [text('0.8')], [text('3')]],
      [[text('b')], [], []],
      [[text('c')], [text('1')], [text('2')]]
    ]);
  });

  it('reads a table without outer pipes, an escaped pipe inside a cell, and unaligned columns', () => {
    const [table] = parseBlocks('a | b\n--- | ---\nx \\| y | z') as Extract<Block, { type: 'table' }>[];

    expect(table.align).toEqual([undefined, undefined]);
    expect(table.rows).toEqual([[[text('x | y')], [text('z')]]]);
  });

  it('wants the separator to have as many cells as the header, and takes a dash or two as enough', () => {
    expect(parseBlocks('a | b\n---')).toEqual([paragraph(text('a | b')), { type: 'hr' }]);
    const [table] = parseBlocks('a | b\n:- | -:\nx | y') as Extract<Block, { type: 'table' }>[];
    expect(table.align).toEqual(['left', 'right']);
  });

  it('does not take a line with a pipe for a table without its separator', () => {
    expect(parseBlocks('a | b\nnot a separator')).toEqual([paragraph(text('a | b not a separator'))]);
  });

  it('reads Windows line endings', () => {
    expect(parseBlocks('# A\r\n\r\ntext\r\nmore')).toEqual([
      { type: 'heading', level: 1, children: [text('A')] },
      paragraph(text('text more'))
    ]);
  });

  it('is empty for nothing, and for whitespace', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks('  \n\n \t\n')).toEqual([]);
  });

  it('takes no time over blocks built to be slow either: endless items, quotes, pipes and fences', () => {
    const started = Date.now();
    for (const source of [
      '- '.repeat(10_000),
      '- a\n'.repeat(5_000),
      '> '.repeat(10_000),
      '1. a\n   - b\n'.repeat(2_000),
      '|'.repeat(20_000),
      '| a |\n|---|\n'.repeat(2_000),
      '```\n'.repeat(5_000),
      '# '.repeat(10_000),
      'a\n'.repeat(20_000)
    ]) {
      parseBlocks(source);
    }
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('stops nesting quotes at a depth, so a hostile source cannot recurse without end', () => {
    expect(() => parseBlocks('> '.repeat(500) + 'deep')).not.toThrow();
    expect(() => parseBlocks(Array.from({ length: 200 }, (_, index) => `${'  '.repeat(index)}- item`).join('\n'))).not.toThrow();
  });
});
