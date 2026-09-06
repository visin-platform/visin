import type { IEpoch } from '../models/Epoch';

/**
 * A finding, rendered as a section someone can paste into a paper.
 *
 * The point of generating this here rather than asking an assistant for LaTeX
 * is the table. An assistant writing a results table retypes numbers it read
 * earlier in the conversation, and a digit that slips there becomes a wrong
 * figure in a published paper — the one error class nobody catches by reading.
 * The prose is written by whoever recorded the finding; every number in the
 * table is read out of the recorded epochs at export time.
 */

/** Characters that mean something to TeX and must not reach it raw. */
const LATEX_SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}'
};

/**
 * Escape in one pass.
 *
 * One pass and not a chain of replaces: escaping `\` first and `&` second means
 * the backslash introduced by the second replace gets escaped by nothing, but a
 * chain in the other order double-escapes what the first one produced. A single
 * regex with a lookup cannot re-visit its own output.
 */
export const escapeLatex = (text: string): string =>
  text.replace(/[\\&%$#_{}~^]/g, (character) => LATEX_SPECIAL[character]);

/**
 * `**bold**`, `*emphasis*`, `_emphasis_`, `` `code` `` — the ones people actually type.
 *
 * Underscore emphasis must not begin or end inside a word, which is what
 * CommonMark requires and, here, what stops `val_loss and train_loss` becoming
 * `val\emph{loss and train}loss`. Metric names carry underscores constantly in
 * this domain, so the naive rule silently corrupts the prose it is meant to
 * typeset.
 */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9]))/;

/**
 * One line of markdown as LaTeX.
 *
 * Split on the markup first and escape only the literal segments: escaping the
 * whole line up front would turn `_` into `\_` and destroy the very markers
 * this needs to read.
 */
export function inlineToLatex(text: string): string {
  return text
    .split(new RegExp(INLINE.source, 'g'))
    .map((part, index) => {
      if (index % 2 === 0) return escapeLatex(part);
      if (part.startsWith('**')) return `\\textbf{${escapeLatex(part.slice(2, -2))}}`;
      if (part.startsWith('`')) return `\\texttt{${escapeLatex(part.slice(1, -1))}}`;
      return `\\emph{${escapeLatex(part.slice(1, -1))}}`;
    })
    .join('');
}

/**
 * The body of a finding as LaTeX prose.
 *
 * Deliberately a small subset — headings, both kinds of list, paragraphs and
 * inline emphasis. Anything richer is a markdown renderer, and a finding that
 * needs one is a finding that should have been shorter.
 */
export function markdownToLatex(markdown: string): string {
  const out: string[] = [];
  let list: 'itemize' | 'enumerate' | null = null;

  const closeList = () => {
    if (list) {
      out.push(`\\end{${list}}`);
      list = null;
    }
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();

    if (line === '') {
      closeList();
      // A blank line between paragraphs is exactly what TeX wants; several in
      // a row are not, so they collapse.
      if (out[out.length - 1] !== '') out.push('');
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      out.push(`\\subsubsection{${inlineToLatex(heading[2])}}`);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const wanted = bullet ? 'itemize' : 'enumerate';
      if (list !== wanted) {
        closeList();
        out.push(`\\begin{${wanted}}`);
        list = wanted;
      }
      out.push(`  \\item ${inlineToLatex((bullet ?? numbered)![1])}`);
      continue;
    }

    closeList();
    out.push(inlineToLatex(line));
  }

  closeList();
  return out.join('\n').trim();
}

/* -------------------------------------------------------------------------- */
/* The results table                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Metric subtrees that are machine telemetry rather than a result.
 *
 * Same exclusion mcp-service makes, and deliberately a second copy rather than
 * a shared one: putting it in backend-core would make this feature wait on a
 * lib release and a version bump in two services, for twenty lines that have
 * never changed.
 */
const NOT_METRICS = new Set(['system_info']);

interface Leaf {
  path: string;
  value: number;
  depth: number;
}

function numericLeaves(results: Record<string, unknown>, prefix = '', depth = 1): Leaf[] {
  return Object.entries(results).flatMap(([key, value]) => {
    if (depth === 1 && NOT_METRICS.has(key)) return [];

    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) return [{ path, value, depth }];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return numericLeaves(value as Record<string, unknown>, path, depth + 1);
    }
    return [];
  });
}

/**
 * An epoch's headline metrics.
 *
 * Only the shallowest leaves, which is what separates a summary from a
 * per-class breakdown without knowing either schema: `val.loss` sits above
 * `val.vehicle.iou`, and a results table wants the first.
 */
export function epochMetrics(results: Record<string, unknown>): Map<string, number> {
  const leaves = numericLeaves(results);
  if (leaves.length === 0) return new Map();

  const shallowest = Math.min(...leaves.map((leaf) => leaf.depth));
  return new Map(
    leaves.filter((leaf) => leaf.depth === shallowest).map((leaf) => [leaf.path, leaf.value])
  );
}

/** More columns than this and the table runs off a two-column page. */
export const MAX_TABLE_METRICS = 6;

export interface ExportRun {
  _id: string;
  name: string;
  epochs: Pick<IEpoch, 'epoch' | 'results'>[];
}

export interface ExportOptions {
  /** Which metric decides the epoch each row reports. Omit to use the last one. */
  selectBy?: string;
  /** Whether the best value of `selectBy` is its highest or its lowest. */
  direction?: 'max' | 'min';
  /** Columns, in order. Omit to take the first few alphabetically. */
  metrics?: string[];
}

interface Row {
  name: string;
  epoch: number;
  values: Map<string, number>;
}

/**
 * Pick the epoch each run is reported at.
 *
 * A paper reports one checkpoint per run, so a row is one epoch — not each
 * metric's own best epoch, which is a number no single saved model ever
 * achieved. Which epoch is the author's call: `selectBy` names the metric that
 * decides it, because this service cannot know whether a given metric is one to
 * maximise or minimise, and guessing from its name would be wrong on exactly
 * the custom metrics that matter.
 */
function selectRow(run: ExportRun, options: ExportOptions): Row | null {
  if (run.epochs.length === 0) return null;

  const scored = run.epochs
    .map((epoch) => ({ epoch, values: epochMetrics(epoch.results as Record<string, unknown>) }))
    .filter((candidate) => candidate.values.size > 0);
  if (scored.length === 0) return null;

  if (!options.selectBy) {
    const last = scored[scored.length - 1];
    return { name: run.name, epoch: last.epoch.epoch, values: last.values };
  }

  const eligible = scored.filter((candidate) => candidate.values.has(options.selectBy!));
  if (eligible.length === 0) return null;

  const better = options.direction === 'min' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  const best = eligible.reduce((winner, candidate) =>
    better(candidate.values.get(options.selectBy!)!, winner.values.get(options.selectBy!)!)
      ? candidate
      : winner
  );

  return { name: run.name, epoch: best.epoch.epoch, values: best.values };
}

/** Four decimals: training metrics are rarely meaningful past that, and a table is read across. */
const cell = (value: number | undefined): string =>
  value === undefined ? '--' : Number.isInteger(value) ? String(value) : value.toFixed(4);

/**
 * The caption, which has to say exactly which epoch each row is.
 *
 * Not decoration. A results table whose provenance is unstated is one a
 * reviewer cannot check and a co-author cannot reproduce, and "best epoch" and
 * "final epoch" are very different claims about the same run.
 */
function caption(options: ExportOptions): string {
  const scope = options.selectBy
    ? `each at the epoch with its ${options.direction === 'min' ? 'lowest' : 'highest'} ` +
      `\\texttt{${escapeLatex(options.selectBy)}}`
    : 'each at its final recorded epoch';

  // The title is not repeated here: the table sits directly under the heading
  // that carries it, and embedding it mid-sentence read like a quotation with
  // the quotes missing.
  return `Results for the runs analysed in this section, ${scope}. ` +
    'Values are read from the recorded training log, not transcribed.';
}

export interface FindingForExport {
  _id: string;
  title: string;
  body: string;
  recommendations?: string;
  authorKind: 'person' | 'assistant';
  authorLabel: string;
  createdAt: Date | string;
}

/**
 * A finding as a self-contained LaTeX section.
 *
 * Not a whole document: it is meant to be `\input` into a paper that already
 * has a preamble, so it carries no `\documentclass`. The packages it needs are
 * named in a comment instead of assumed — a section that silently requires
 * booktabs fails at compile time with an error about `\toprule` that says
 * nothing about where it came from.
 */
export function findingToLatex(
  finding: FindingForExport,
  runs: ExportRun[],
  options: ExportOptions = {}
): string {
  const rows = runs.map((run) => selectRow(run, options)).filter((row): row is Row => row !== null);

  const available = [...new Set(rows.flatMap((row) => [...row.values.keys()]))].sort();
  const columns = (options.metrics?.filter((metric) => available.includes(metric)) ?? available).slice(
    0,
    MAX_TABLE_METRICS
  );

  // Tolerant on purpose: this ends up in a comment line, and failing an export
  // over a missing timestamp would trade the whole section for a decoration.
  const written =
    finding.createdAt instanceof Date
      ? finding.createdAt.toISOString()
      : String(finding.createdAt ?? '');

  const lines = [
    `% Exported from Visin — finding ${finding._id}` +
      (written ? `, recorded ${written.slice(0, 10)}` : ''),
    `% by ${finding.authorKind === 'assistant' ? 'assistant' : 'author'}: ${finding.authorLabel}`,
    '% Requires: \\usepackage{booktabs}',
    '',
    `\\subsection{${inlineToLatex(finding.title)}}`,
    '',
    markdownToLatex(finding.body)
  ];

  if (rows.length > 0 && columns.length > 0) {
    lines.push(
      '',
      '\\begin{table}[htbp]',
      '\\centering',
      `\\caption{${caption(options)}}`,
      `\\label{tab:visin-${finding._id}}`,
      `\\begin{tabular}{l${'r'.repeat(columns.length + 1)}}`,
      '\\toprule',
      `Run & Epoch & ${columns.map((metric) => `\\texttt{${escapeLatex(metric)}}`).join(' & ')} \\\\`,
      '\\midrule',
      ...rows.map(
        (row) =>
          `${inlineToLatex(row.name)} & ${row.epoch} & ` +
          `${columns.map((metric) => cell(row.values.get(metric))).join(' & ')} \\\\`
      ),
      '\\bottomrule',
      '\\end{tabular}',
      '\\end{table}'
    );
  }

  if (finding.recommendations?.trim()) {
    // Kept out of the section body: what to run next is lab notes, and a
    // reviewer reading "try a smaller window" in a results section is reading
    // something that was never meant for them. Commented so it survives the
    // round trip without compiling into the paper.
    lines.push(
      '',
      '% Suggested next run (not part of the section — delete before submitting):',
      ...markdownToLatex(finding.recommendations)
        .split('\n')
        .map((line) => `% ${line}`)
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
