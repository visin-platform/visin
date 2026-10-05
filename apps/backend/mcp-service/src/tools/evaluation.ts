import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import type { EvaluationRecord, Leaderboard, Suite } from '../schemas';
import { Caller, ToolModule, capped, count, explain, fail, licenseSentence, metric, ok } from './module';

/**
 * Suites, and how models rank on them.
 *
 * A suite is a written-down way of scoring a model; an evaluation is one checkpoint's results on one suite version.
 * Three tools, shaped by the questions people ask: which suites exist, how do the models rank on one, and where is
 * each model weakest. Each says plainly what a ranking is and is not, because a model that repeats "rank 1" without
 * the pool, the evidence level or the fact that it is the submitter's own report has told the user something false.
 */

const DEFAULT_ROWS = 20;
const MAX_ROWS = 50;
/** What one request may ask of the server, and how many requests one tool call may make. */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** What every ranking is, in the words a model should repeat. */
const CAVEAT =
  'Scores are what the submitters reported; Visin checks they fit the suite but has not verified the model or the ' +
  'data. A rank is a position among the results this key can read, not among everything ever run.';

interface SuiteRef {
  slug: string;
  version: number | 'latest';
}

const SUITE_REF = /^([a-z0-9][a-z0-9-]{0,62}[a-z0-9]|[a-z0-9])(?:@([1-9][0-9]{0,5}|latest))?$/;

function parseSuite(text: string): SuiteRef | undefined {
  const match = SUITE_REF.exec(text.trim());
  if (!match) return undefined;
  return { slug: match[1], version: match[2] && match[2] !== 'latest' ? Number(match[2]) : 'latest' };
}

const badSuite = (text: string) =>
  fail(`"${text}" is not a suite name. Use slug@version, such as road-test@1, or just the slug for the newest version (see list_suites).`);

/**
 * How each kind of checkpoint is named to a person, keyed by its kind: a store's own fields are read here and nowhere
 * else. A kind not listed is shown by its kind, so a newer server's checkpoint is named rather than lost.
 */
const checkpointNames: Record<string, (checkpoint: Record<string, unknown>) => string | undefined> = {
  hf: (checkpoint) => (typeof checkpoint.repo === 'string' && typeof checkpoint.commit === 'string' ? `${checkpoint.repo} @ ${checkpoint.commit.slice(0, 7)}` : undefined),
  local: (checkpoint) => (typeof checkpoint.label === 'string' ? checkpoint.label : undefined)
};

/** A checkpoint as a person names it: by what its kind says, else by its kind. */
function modelName(checkpoint: Leaderboard['entries'][number]['checkpoint'] | EvaluationRecord['checkpoint']): string {
  if (!checkpoint) return 'unknown checkpoint';
  return checkpointNames[checkpoint.kind]?.(checkpoint) ?? `${checkpoint.kind} checkpoint`;
}

const better = (direction: 'max' | 'min') => (direction === 'max' ? 'higher' : 'lower');

/** The evidence level worth saying: observed is the strong one, so only the weaker ones are named. */
const labelled = (level: string | undefined) => (level === 'reported' || level === 'attested' ? `, ${level}` : '');

/**
 * Every ranked row of a suite, paging through the ranking up to `MAX_PAGES` pages. A question about the whole ranking
 * ("who is weakest in the dark?") cannot be answered from its first page, and a silently short answer is worse than
 * a slow one, so what was not looked at is reported.
 */
async function allEntries(key: string, slug: string, version: number | 'latest'): Promise<{ entries: Leaderboard['entries']; total: number; truncated: boolean }> {
  const first = await vision.getLeaderboard(key, slug, version, { limit: PAGE_SIZE, page: 1 });
  const entries = [...first.entries];
  const pages = first.pagination?.pages ?? 1;
  for (let page = 2; page <= Math.min(pages, MAX_PAGES); page++) {
    entries.push(...(await vision.getLeaderboard(key, slug, version, { limit: PAGE_SIZE, page })).entries);
  }
  return { entries, total: first.pagination?.total ?? entries.length, truncated: pages > MAX_PAGES };
}

/** The suites a key can read, as many pages as a text search needs; without a search the first page and a count. */
async function suitesMatching(key: string, query: { projectId?: string; includeArchived?: string }, search: string | undefined) {
  const first = await vision.listSuites(key, { ...query, limit: PAGE_SIZE, page: 1 });
  const suites = [...first.suites];
  const pages = first.pagination?.pages ?? 1;
  if (search) {
    for (let page = 2; page <= Math.min(pages, MAX_PAGES); page++) {
      suites.push(...(await vision.listSuites(key, { ...query, limit: PAGE_SIZE, page })).suites);
    }
  }
  const examined = search ? Math.min(pages, MAX_PAGES) * PAGE_SIZE : PAGE_SIZE;
  return { suites, total: first.pagination?.total ?? suites.length, searchedAll: !search || pages <= MAX_PAGES, examined };
}

function describeSuite(suite: Suite): string {
  const headline = suite.protocol.metrics.find((item) => item.headline);
  const conditions = suite.protocol.conditions
    .map((condition) => (condition.sampleCount === undefined ? condition.name : `${condition.name} (${count(condition.sampleCount)})`))
    .join(', ');
  const parts = [
    `- ${suite.slug}@${suite.version} — ${suite.name} [${suite.visibility}${suite.archivedAt ? ', archived' : ''}]`,
    headline ? `  ranks by ${headline.key} (${better(headline.direction)} is better)` : undefined,
    suite.protocol.task ? `  task: ${suite.protocol.task}` : undefined,
    conditions ? `  conditions: ${conditions}` : undefined,
    `  ${licenseSentence(suite.dataTerms?.license, suite.dataTerms?.credit, 'Data licence')}`,
    suite.dataTerms?.sourceUrl ? `  data source: ${suite.dataTerms.sourceUrl}` : undefined
  ];
  return parts.filter(Boolean).join('\n');
}

function registerReadTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_suites',
    {
      title: 'Evaluation suites',
      description:
        'The suites this key can read: each is a fixed way of scoring a model (its data, conditions, metrics and which ' +
        'direction is better), so results on one suite version can be compared and ranked. Use it to turn a name the ' +
        'user says into the slug@version the other tools take. Public suites are listed from every project.',
      inputSchema: {
        project: z.string().optional().describe('Only this project\'s suites: its slug or id, from list_projects'),
        search: z.string().optional().describe('Keep suites whose name or slug contains this text'),
        include_archived: z.boolean().optional().describe('Also list suites that no longer take new results')
      }
    },
    async ({ project, search, include_archived }) => {
      try {
        const { suites, total, searchedAll } = await suitesMatching(key, { projectId: project, includeArchived: include_archived ? 'true' : undefined }, search);
        const wanted = search?.trim().toLowerCase();
        const found = wanted
          ? suites.filter((suite) => suite.name.toLowerCase().includes(wanted) || suite.slug.toLowerCase().includes(wanted))
          : suites;
        if (found.length === 0) {
          return ok(
            search || project
              ? `No suite matches${searchedAll ? '' : ` among the first ${count(suites.length)} of ${count(total)}`}. Try without the filters, or check the project with list_projects.`
              : 'No suite is visible to this key. A suite follows its project: a private project\'s suites are invisible to anyone else.'
          );
        }
        const { shown, note } = capped(found, 50, 'suites');
        const unsearched = !search && total > suites.length ? `\n\n(The first ${count(suites.length)} of ${count(total)} suites. Narrow it with a project or a search to see others.)` : '';
        const partial = search && !searchedAll ? `\n\n(Searched the first ${count(suites.length)} of ${count(total)} suites; a match further on was not looked at. Narrow it with a project.)` : '';
        return ok([`${count(found.length)} suites:`, ...shown.map(describeSuite)].join('\n') + note + unsearched + partial);
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_leaderboard',
    {
      title: 'How models rank on a suite',
      description:
        'The ranking of one suite version: one row per checkpoint, from its latest eligible result (never its best repeat), ' +
        'best first in the direction the suite says, with the headline score, the condition each model is weakest in and ' +
        'how many attempts it had. Ties share a rank. Results are labelled observed, reported or attested by how much ' +
        'the evaluator said about what it ran; attested is a manager vouching for an old result. ' +
        `${CAVEAT} Checkpoints with attempts but none eligible are counted, with why, not ranked.`,
      inputSchema: {
        suite: z.string().describe('slug@version, such as road-test@1, or the slug alone for the newest version'),
        observed_only: z.boolean().optional().describe('Rank only results whose evaluator sent complete evidence; the ranks are then among those alone'),
        limit: z.number().int().min(1).max(MAX_ROWS).optional().describe(`How many rows (default ${DEFAULT_ROWS}, at most ${MAX_ROWS})`),
        page: z.number().int().min(1).optional().describe('Which page of rows, with ranks that stay global')
      }
    },
    async ({ suite, observed_only, limit, page }) => {
      const ref = parseSuite(suite);
      if (!ref) return badSuite(suite);
      try {
        const rows = limit ?? DEFAULT_ROWS;
        const board = await vision.getLeaderboard(key, ref.slug, ref.version, {
          limit: rows,
          page: page ?? 1,
          evidence: observed_only ? 'observed' : undefined
        });
        const { headline } = board.suite;
        const total = board.pagination?.total ?? board.entries.length;
        const lines = [
          `${board.suite.slug}@${board.suite.version} — ${board.suite.name}. Ranked by ${headline.key}` +
            `${headline.unit ? ` (${headline.unit})` : ''}, ${better(headline.direction)} is better.`,
          `${count(total)} ranked checkpoint${total === 1 ? '' : 's'}, from ${count(board.scope.candidates)} evaluation${board.scope.candidates === 1 ? '' : 's'} this key can read${observed_only ? ', observed evidence only' : ''}.`,
          ''
        ];
        if (board.entries.length === 0) {
          lines.push(total > 0 ? 'No rows on this page.' : observed_only ? 'No result here has complete observed evidence.' : 'Nothing is ranked yet.');
        }
        for (const entry of board.entries) {
          lines.push(
            `${entry.rank}. ${modelName(entry.checkpoint)} — ${metric(entry.summary.headline.value)}; weakest ${entry.summary.worst.condition} ` +
              `${metric(entry.summary.worst.value)} (gap ${metric(entry.summary.gap)}); ${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}${labelled(entry.evidenceLevel)} [${entry.evaluationId}]`
          );
        }
        if (board.pagination && (board.pagination.pages ?? 1) > 1) {
          lines.push('', `Page ${board.pagination.page} of ${board.pagination.pages}. Ask for another page to see the rest.`);
        }
        const unranked = board.unranked.length;
        if (unranked > 0) {
          const why = [...new Set(board.unranked.flatMap((row) => row.reasons.map((reason) => reason.code)))].slice(0, 5).join(', ');
          lines.push('', `${count(unranked)} more checkpoint${unranked === 1 ? ' has' : 's have'} attempts but no eligible result${why ? ` (${why})` : ''}.`);
        }
        lines.push('', CAVEAT);
        return ok(lines.join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_worst_conditions',
    {
      title: 'Where models are weakest',
      description:
        'Where a model falls down. With an evaluation id, its conditions from weakest to strongest on the suite\'s headline ' +
        'metric, in the suite\'s direction (so for a loss the weakest is the highest). Without one, each ranked model on a ' +
        'suite with the condition it is weakest in, the worst first — the answer to "which model collapses in the dark?". ' +
        'A model can lead overall and still be the worst in one condition. ' +
        CAVEAT,
      inputSchema: {
        suite: z.string().describe('slug@version, such as road-test@1, or the slug alone for the newest version'),
        evaluation: z.string().optional().describe('An evaluation id, shown in square brackets after each row of get_leaderboard, to look at one model\'s conditions'),
        limit: z.number().int().min(1).max(MAX_ROWS).optional().describe(`How many rows without an evaluation (default ${DEFAULT_ROWS})`)
      }
    },
    async ({ suite, evaluation, limit }) => {
      const ref = parseSuite(suite);
      if (!ref) return badSuite(suite);
      try {
        const details = await vision.getSuite(key, ref.slug, ref.version);
        const headline = details.protocol.metrics.find((item) => item.headline);
        if (!headline) return fail(`${details.slug}@${details.version} names no headline metric to rank conditions by.`);
        const worstFirst = (a: number, b: number) => (headline.direction === 'max' ? a - b : b - a);

        if (evaluation) {
          const record = await vision.getEvaluation(key, evaluation);
          if (record.suite && (record.suite.slug !== details.slug || record.suite.version !== details.version)) {
            return fail(`That evaluation is on ${record.suite.slug}@${record.suite.version}, not ${details.slug}@${details.version}; conditions are only comparable within one suite version.`);
          }
          const scores = record.validation.scores;
          if (!scores) {
            return ok(`That evaluation is ${record.validation.state}, so it has no ranked scores to look at. get_leaderboard lists why results are not ranked.`);
          }
          const rows = Object.entries(scores.conditions)
            .flatMap(([condition, values]) => (values[headline.key] === undefined ? [] : [{ condition, value: values[headline.key] }]))
            .sort((a, b) => worstFirst(a.value, b.value));
          const overall = scores.overall[headline.key];
          return ok(
            [
              `${modelName(record.checkpoint)} on ${details.slug}@${details.version}, by ${headline.key} (${better(headline.direction)} is better)${overall === undefined ? '' : `; overall ${metric(overall)}`}.`,
              'Weakest first:',
              ...rows.map((row, index) => `${index + 1}. ${row.condition} — ${metric(row.value)}`),
              '',
              CAVEAT
            ].join('\n')
          );
        }

        const { entries, total, truncated } = await allEntries(key, details.slug, details.version);
        if (entries.length === 0) return ok(`Nothing is ranked on ${details.slug}@${details.version} yet.`);
        const rows = [...entries].sort((a, b) => worstFirst(a.summary.worst.value, b.summary.worst.value));
        const { shown, note } = capped(rows, limit ?? DEFAULT_ROWS, 'models');
        const looked = truncated ? `\n\n(Looked at the top ${count(entries.length)} of ${count(total)} ranked models; ones ranked lower were not examined.)` : '';
        return ok(
          [
            `Where each ranked model is weakest on ${details.slug}@${details.version}, by ${headline.key} (${better(headline.direction)} is better), the worst first:`,
            ...shown.map((entry) => `- ${modelName(entry.checkpoint)} — ${entry.summary.worst.condition} ${metric(entry.summary.worst.value)} (overall ${metric(entry.summary.headline.value)}, rank ${entry.rank})${labelled(entry.evidenceLevel)} [${entry.evaluationId}]`),
            '',
            CAVEAT
          ].join('\n') + note + looked
        );
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const evaluationRead: ToolModule = { scopes: ['vision:read'], register: registerReadTools };
