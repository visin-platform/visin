import type { Inline } from './parse';

/** What a run of inline Markdown reads as, with the marks left out: a link is its words, an image its alt text. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text;
        case 'image':
          return node.alt;
        case 'br':
          return ' ';
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}

/**
 * One cell as a spreadsheet takes it. A cell with a tab, a line break or a quote is wrapped in quotes with its quotes
 * doubled, which Excel, Sheets and Numbers all read back as the one cell; any other cell goes as it is.
 */
const cell = (text: string): string => {
  const flat = neutralised(text.replace(/\r?\n/g, ' ').trim());
  return /[\t"]/.test(flat) ? `"${flat.replaceAll('"', '""')}"` : flat;
};

/** A number as people write one in a table: a sign, digits with separators, a unit or a percent, nothing that computes. */
const NUMBER = /^[+-]?\s?\d[\d.,\s]*\s?[%a-z]{0,3}$/i;

/**
 * A cell a spreadsheet would take for a formula (it starts with `=`, `+`, `-` or `@`) is copied with a leading
 * apostrophe, which the spreadsheet reads as "this is text". The tables come from other people (a public readme, a
 * model's answer), and pasting one must not run what it says. A plain number (`-0.5`, `+3`, `12 %`) is left as it is,
 * so a column of results stays numbers.
 */
const neutralised = (text: string): string =>
  /^[=+\-@]/.test(text) && !NUMBER.test(text) && !/^[+-]$/.test(text) ? `'${text}` : text;

/** A table as tab-separated lines, header first, which pastes into a spreadsheet as cells. */
export function tableText(head: Inline[][], rows: Inline[][][]): string {
  return [head, ...rows].map((row) => row.map((value) => cell(inlineText(value))).join('\t')).join('\n');
}
