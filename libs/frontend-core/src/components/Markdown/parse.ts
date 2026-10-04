/**
 * A small Markdown parser for text written by other people and shown to strangers (a project's readme).
 *
 * It produces a tree, never HTML: nothing here can inject markup, and raw HTML in the source is just text. It
 * reads the part of Markdown a readme uses: headings, paragraphs, emphasis, code, links, lists (nested), quotes,
 * rules and tables. Images are not loaded (see `Inline`), and a link must be http(s), mailto, an in-page `#anchor`
 * or an app path.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  /** `href` is null where the address is not one a link may have: the text is then shown without it. */
  | { type: 'link'; href: string | null; children: Inline[] }
  /** Never fetched: a readme that could load images could tell its author who read it, and from where. */
  | { type: 'image'; alt: string; href: string | null }
  | { type: 'br' };

export type Align = 'left' | 'center' | 'right' | undefined;

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { type: 'hr' };

/** Quotes and lists inside quotes and lists stop here, so a hostile source cannot recurse without end. */
const MAX_DEPTH = 6;

/** The addresses a link may have; anything else (`javascript:`, `data:`, `vbscript:`) is shown as text. */
export function safeHref(href: string): string | null {
  const url = href.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
}

/**
 * Each pattern is global, so the scan below can resume where it left off, and every open-ended span is bounded: a
 * readme is written by strangers and read by everyone, and a page of unclosed `*` must cost a visitor milliseconds.
 */
interface Rule {
  re: RegExp;
  make: (m: RegExpExecArray) => { node: Inline; length: number };
}

const inlineRules = (depth: number): Rule[] => [
  { re: /\\([\\`*_{}[\]()#+\-.!~|>])/g, make: (m) => ({ node: { type: 'text', text: m[1] }, length: m[0].length }) },
  {
    // A run of backticks opens it and an equal run closes it; a longer or shorter run is just text. Bounded, or a page of
    // backticks would take cubic time.
    re: /(?<!`)(`{1,8})(?!`)([\s\S]{0,1000}?[^`])(?<!`)\1(?!`)/g,
    make: (m) => ({ node: { type: 'code', text: m[2].replace(/^ (.*) $/, '$1') }, length: m[0].length })
  },
  {
    re: /!\[([^\]\n]{0,300})\]\(\s*<?((?:[^\s()<>]|\([^\s()<>]*\)){1,2000})>?(?:\s+"[^"\n]{0,300}")?\s*\)/g,
    make: (m) => ({ node: { type: 'image', alt: m[1], href: safeHref(m[2]) }, length: m[0].length })
  },
  {
    re: /\[((?:[^\]\\\n]|\\.){1,500})\]\(\s*<?((?:[^\s()<>]|\([^\s()<>]*\)){1,2000})>?(?:\s+"[^"\n]{0,300}")?\s*\)/g,
    make: (m) => ({ node: { type: 'link', href: safeHref(m[2]), children: parseInline(m[1], depth + 1) }, length: m[0].length })
  },
  {
    re: /<((?:https?:\/\/|mailto:)[^\s<>]{1,2000})>/gi,
    make: (m) => ({ node: { type: 'link', href: safeHref(m[1]), children: [{ type: 'text', text: m[1] }] }, length: m[0].length })
  },
  {
    re: /\bhttps?:\/\/[^\s<]{1,2000}/gi,
    make: (m) => {
      // A sentence's own punctuation is not part of the address that ends it.
      const url = m[0].replace(/[.,;:!?)'"\]]+$/, '');
      return { node: { type: 'link', href: safeHref(url), children: [{ type: 'text', text: url }] }, length: url.length };
    }
  },
  {
    // The closing pair is the last two of a run, so `**bold *and italic***` closes at the end, not in the middle.
    re: /\*\*(?=\S)([\s\S]{0,1000}?\S)\*\*(?!\*)/g,
    make: (m) => ({ node: { type: 'strong', children: parseInline(m[1], depth + 1) }, length: m[0].length })
  },
  {
    re: /(?<![\w_])__(?=\S)([\s\S]{0,1000}?\S)__(?![\w_])/g,
    make: (m) => ({ node: { type: 'strong', children: parseInline(m[1], depth + 1) }, length: m[0].length })
  },
  {
    re: /~~(?=\S)([\s\S]{0,1000}?\S)~~/g,
    make: (m) => ({ node: { type: 'del', children: parseInline(m[1], depth + 1) }, length: m[0].length })
  },
  {
    // `_` inside a word (snake_case) is not emphasis.
    re: /(?:(?<![\w*])\*(?=[^\s*])([\s\S]{0,1000}?[^\s*])\*(?!\*)|(?<![\w_])_(?=[^\s_])([\s\S]{0,1000}?[^\s_])_(?![\w_]))/g,
    make: (m) => ({ node: { type: 'em', children: parseInline(m[1] ?? m[2], depth + 1) }, length: m[0].length })
  },
  { re: /(?: {2,}|\\)\n/g, make: (m) => ({ node: { type: 'br' }, length: m[0].length }) }
];

/** Longer than a paragraph needs: shown as the text it is, with no emphasis or links read out of it. */
const MAX_INLINE_LENGTH = 5000;

export function parseInline(text: string, depth = 0): Inline[] {
  if (depth > MAX_DEPTH) return [{ type: 'text', text }];
  if (text.length > MAX_INLINE_LENGTH) return [{ type: 'text', text: text.replace(/\n/g, ' ') }];
  const rules = inlineRules(depth);
  // Where each pattern next matches, found once and kept until the scan passes it; null: nowhere ahead.
  const next: ({ index: number; length: number; node: Inline } | null | undefined)[] = rules.map(() => undefined);
  const out: Inline[] = [];
  const push = (value: string) => {
    const plain = value.replace(/\n/g, ' ');
    if (!plain) return;
    const last = out[out.length - 1];
    if (last?.type === 'text') last.text += plain;
    else out.push({ type: 'text', text: plain });
  };

  const find = (k: number, from: number) => {
    const held = next[k];
    if (held === null || (held && held.index >= from)) return held;
    const rule = rules[k];
    rule.re.lastIndex = from;
    const m = rule.re.exec(text);
    next[k] = m ? { index: m.index, ...rule.make(m) } : null;
    return next[k];
  };

  let pos = 0;
  while (pos < text.length) {
    let best: { index: number; length: number; node: Inline } | null = null;
    for (let k = 0; k < rules.length; k += 1) {
      const found = find(k, pos);
      if (found && (!best || found.index < best.index)) best = found;
    }
    if (!best) {
      push(text.slice(pos));
      break;
    }
    push(text.slice(pos, best.index));
    if (best.node.type === 'text') push(best.node.text);
    else out.push(best.node);
    pos = best.index + best.length;
  }
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)[^\n]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line: string): number => line.match(/^\s*/)![0].replace(/\t/g, '    ').length;

const splitRow = (line: string): string[] => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
};

/** A header row, then a delimiter row with as many cells: what makes a table a table. */
const isTableStart = (lines: string[], i: number): boolean =>
  lines[i].includes('|') &&
  i + 1 < lines.length &&
  TABLE_SEPARATOR.test(lines[i + 1]) &&
  splitRow(lines[i + 1]).length === splitRow(lines[i]).length;

const startsBlock = (line: string): boolean =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);

export function parseBlocks(source: string, depth = 0): Block[] {
  if (depth > MAX_DEPTH) return [{ type: 'paragraph', children: [{ type: 'text', text: source }] }];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence, or the end of the text: an unclosed block runs to the end
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner.join('\n'), depth + 1) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : undefined
      );
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({
        type: 'table',
        align,
        head: head.map((cell) => parseInline(cell)),
        // A row has as many cells as the header: short ones are padded, long ones cut.
        rows: rows.map((row) => head.map((_, column) => parseInline(row[column] ?? '')))
      });
      continue;
    }

    const item = ITEM.exec(line);
    if (item) {
      const base = indentOf(line);
      const ordered = /\d/.test(item[2]);
      const items: string[][] = [];
      const start = ordered ? parseInt(item[2], 10) : 1;
      while (i < lines.length) {
        const current = lines[i];
        const marker = ITEM.exec(current);
        if (marker && indentOf(current) === base) {
          // A numbered list and a bullet list beside each other are two lists.
          if (/\d/.test(marker[2]) !== ordered) break;
          items.push([marker[3]]);
          i += 1;
        } else if (items.length > 0 && current.trim() && indentOf(current) > base) {
          // Belongs to the item above: more of its text, or a list nested in it.
          items[items.length - 1].push(current.slice(Math.min(indentOf(current), base + 2)));
          i += 1;
        } else if (
          !current.trim() &&
          i + 1 < lines.length &&
          lines[i + 1].trim() &&
          (indentOf(lines[i + 1]) > base || (ITEM.test(lines[i + 1]) && indentOf(lines[i + 1]) === base && /\d/.test(ITEM.exec(lines[i + 1])![2]) === ordered))
        ) {
          items[items.length - 1].push('');
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, start, items: items.map((text) => parseBlocks(text.join('\n'), depth + 1)) });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !isTableStart(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}
