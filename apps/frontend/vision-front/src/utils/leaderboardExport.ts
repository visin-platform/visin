import type { EvidenceLevel, Leaderboard, PublicLeaderboard } from '../types/evaluation';
import { checkpointLabel } from '../components/evaluations/sources';
import { EVIDENCE_META, formatFixed } from '../components/evaluations/verdict';
import { csvField } from './csvExport';

/**
 * A leaderboard as a table to paste into a paper or a spreadsheet, with enough in its footnote to trace every row
 * to its source: the suite and version, the protocol digest, the selection rule and each row's evaluation id.
 * One shape serves the signed-in ranking and the public one, which spell their rows differently.
 */
export interface ExportRow {
  rank: number;
  model: string;
  evaluationId: string;
  headline: number;
  worst: { condition: string; value: number };
  gap: number;
  attempts?: number;
  evidence?: EvidenceLevel;
  /** the headline metric in each condition; only the public ranking carries it */
  conditions?: Record<string, number>;
}

export interface ExportTable {
  suite: { slug: string; version: number; name: string; digest: string; headlineKey: string; direction: 'max' | 'min' };
  rows: ExportRow[];
  /** where this page sits among the selected checkpoints, when there is more than one page */
  page?: { page: number; pages: number; total: number };
  /** what the rows are: the pool they were ranked in */
  scope: 'public' | 'visible';
}

const pageOf = (pagination: { page: number; pages: number; total: number } | undefined) =>
  pagination && pagination.pages > 1 ? { page: pagination.page, pages: pagination.pages, total: pagination.total } : undefined;

/** The table of the ranking a signed-in reader sees. */
export function tableFromBoard(board: Leaderboard): ExportTable {
  const { headline, ...suite } = board.suite;
  return {
    suite: { ...suite, headlineKey: headline.key, direction: headline.direction },
    scope: 'visible',
    page: pageOf(board.pagination),
    rows: board.entries.map(entry => ({
      rank: entry.rank,
      model: checkpointLabel(entry.checkpoint),
      evaluationId: entry.evaluationId,
      headline: entry.summary.headline.value,
      worst: entry.summary.worst,
      gap: entry.summary.gap,
      attempts: entry.attempts,
      evidence: entry.evidenceLevel
    }))
  };
}

/** The table of the public ranking, which also carries the score in each condition. */
export function tableFromPublic(board: PublicLeaderboard): ExportTable {
  const { suite } = board;
  return {
    suite: { slug: suite.slug, version: suite.version, name: suite.name, digest: suite.digest, headlineKey: suite.headline.key, direction: suite.headline.direction },
    scope: 'public',
    page: pageOf(board.pagination),
    rows: board.entries.map(entry => ({
      rank: entry.rank,
      model: checkpointLabel(entry.checkpoint),
      evaluationId: entry.evaluationId,
      headline: entry.headline,
      worst: entry.worst,
      gap: entry.gap,
      attempts: entry.attempts,
      evidence: entry.evidenceLevel,
      conditions: entry.conditions
    }))
  };
}

const conditionNames = (table: ExportTable): string[] => [...new Set(table.rows.flatMap(row => Object.keys(row.conditions ?? {})))];

const LATEX_ESCAPES: Record<string, string> = {
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

/** Text that is safe inside a LaTeX table cell or footnote. */
export const latexText = (text: string): string => text.replace(/[\\&%$#_{}~^]/g, character => LATEX_ESCAPES[character]);

const selectionRule = 'one row per checkpoint, from its latest eligible completed evaluation, never its best repeat; ties share a rank';
const direction = (table: ExportTable) => (table.suite.direction === 'max' ? 'higher' : 'lower');

const evidenceNote = (table: ExportTable): string | undefined => {
  const levels = new Set(table.rows.map(row => row.evidence).filter((level): level is EvidenceLevel => Boolean(level)));
  if (levels.size === 0) return undefined;
  return `Evidence: ${[...levels].map(level => EVIDENCE_META[level].label.toLowerCase()).join(', ')}, as reported by the submitters and not verified by Visin.`;
};

/** A LaTeX `table` with the ranking and a footnote that traces it to its suite and evaluations. */
export function leaderboardLatex(table: ExportTable): string {
  const conditions = conditionNames(table);
  const columns = ['Rank', 'Model', table.suite.headlineKey, ...conditions, 'Worst condition', 'Gap'];
  const lines = table.rows.map(row => {
    const cells = [
      String(row.rank),
      latexText(row.model),
      formatFixed(row.headline),
      ...conditions.map(name => (row.conditions?.[name] === undefined ? '--' : formatFixed(row.conditions[name]))),
      `${latexText(row.worst.condition)}: ${formatFixed(row.worst.value)}`,
      formatFixed(row.gap)
    ];
    return `${cells.join(' & ')} \\\\`;
  });
  const slug = `${table.suite.slug}@${table.suite.version}`;
  const notes = [
    `Suite ${slug}, protocol digest ${table.suite.digest}.`,
    `${direction(table)[0].toUpperCase()}${direction(table).slice(1)} ${table.suite.headlineKey} is better; ${selectionRule}.`,
    table.page ? `Page ${table.page.page} of ${table.page.pages} (${table.page.total} checkpoints); ranks are over all pages.` : undefined,
    evidenceNote(table),
    `Evaluations: ${table.rows.map(row => `${row.rank}:${row.evaluationId}`).join(', ')}.`
  ].filter((note): note is string => Boolean(note));
  return [
    '\\begin{table}[t]',
    '\\centering',
    `\\caption{${latexText(table.suite.name)} (${latexText(slug)})}`,
    `\\label{tab:${slug.replace(/[^A-Za-z0-9]+/g, '-')}}`,
    `\\begin{tabular}{rl${'r'.repeat(columns.length - 2)}}`,
    '\\hline',
    `${columns.map(latexText).join(' & ')} \\\\`,
    '\\hline',
    ...lines,
    '\\hline',
    '\\end{tabular}',
    '\\\\[2pt]',
    `\\footnotesize ${notes.map(latexText).join(' ')}`,
    '\\end{table}',
    ''
  ].join('\n');
}

/**
 * One CSV cell, always quoted. Text a spreadsheet would run as a formula is made inert (`csvField`), but a number is
 * written as itself: a negative score such as a log-likelihood must stay a number, not become the text `'-0.52`.
 */
const csvCell = (value: string | number): string => (typeof value === 'number' ? `"${value}"` : csvField(value));

/** The same ranking as CSV, with the trace in columns so it survives being pasted without its footnote. */
export function leaderboardCsv(table: ExportTable): string {
  const conditions = conditionNames(table);
  const header = ['suite', 'digest', 'rank', 'model', table.suite.headlineKey, ...conditions, 'worst_condition', 'worst_value', 'gap', 'attempts', 'evidence', 'evaluation_id'];
  const rows = table.rows.map(row => [
    `${table.suite.slug}@${table.suite.version}`,
    table.suite.digest,
    row.rank,
    row.model,
    row.headline,
    ...conditions.map(name => row.conditions?.[name] ?? ''),
    row.worst.condition,
    row.worst.value,
    row.gap,
    row.attempts ?? '',
    row.evidence ?? '',
    row.evaluationId
  ]);
  return [header, ...rows].map(line => line.map(csvCell).join(',')).join('\n') + '\n';
}
