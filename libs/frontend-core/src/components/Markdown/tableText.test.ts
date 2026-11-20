import { describe, expect, it } from 'vitest';
import { parseBlocks } from './parse';
import { inlineText, tableText } from './tableText';

const table = (source: string) => {
  const block = parseBlocks(source)[0];
  if (block.type !== 'table') throw new Error('not a table');
  return tableText(block.head, block.rows);
};

describe('tableText', () => {
  it('reads the words of every kind of inline, and leaves the marks', () => {
    const [block] = parseBlocks(
      '**bold** *it* ~~gone~~ `code` [link](https://example.test) ![chart](https://example.test/a.png)  \nnext'
    );
    if (block.type !== 'paragraph') throw new Error('not a paragraph');
    expect(inlineText(block.children)).toBe('bold it gone code link chart next');
  });

  it('is one line per row, tab between cells, header first', () => {
    expect(table('| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |')).toBe('a\tb\n1\t2\n3\t4');
  });

  it('quotes a cell that a spreadsheet would split or misread, and doubles its quotes', () => {
    expect(table('| name |\n| - |\n| say "hi" |\n| plain |')).toBe('name\n"say ""hi"""\nplain');
  });

  it('keeps an empty cell empty, so the columns stay where they are', () => {
    expect(table('| a | b | c |\n| - | - | - |\n| 1 | | 3 |')).toBe('a\tb\tc\n1\t\t3');
  });

  it('copies a cell that would run as a formula as text, and leaves numbers as numbers', () => {
    expect(table('| a |\n| - |\n| =HYPERLINK("http://evil.example","x") |')).toBe(
      'a\n"\'=HYPERLINK(""http://evil.example"",""x"")"'
    );
    expect(table('| a |\n| - |\n| @SUM(A1) |\n| +1+cmd |\n| -cmd |\n| - 2 + cmd |')).toBe(
      "a\n'@SUM(A1)\n'+1+cmd\n'-cmd\n'- 2 + cmd"
    );
    // Results stay numbers: signed, with separators, a unit or a percent.
    expect(table('| a |\n| - |\n| -0.5 |\n| +3 |\n| -1,200.5 |\n| 12 % |\n| -3ms |')).toBe(
      'a\n-0.5\n+3\n-1,200.5\n12 %\n-3ms'
    );
    // A dash on its own ("no value"), and ordinary words, are left alone.
    expect(table('| a |\n| - |\n| x |\n| a=b |')).toBe('a\nx\na=b');
    expect(table('| a | b |\n| - | - |\n| - | + |')).toBe('a\tb\n-\t+');
  });
});
