import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import type { Finding } from '../schemas';
import { Caller, ToolModule, capped, count, day, explain, ok } from './module';

/**
 * Written conclusions, and where they land.
 *
 * The reason this exists: an assistant can already work out that window16 beats
 * window24 on ZOD but not on WAYMO, say so once, and leave nothing behind. The
 * next conversation starts from zero and pays to derive it again. A finding is
 * the place that reasoning survives — read back by the next session, and by the
 * person, in the app.
 *
 * Its own scope pair, separate from `vision:write`, so an assistant can be
 * granted "read my experiments and record what you conclude" without also being
 * able to rename a project or retag a run.
 */

/** Names per row in a listing. A finding may cite fifty runs; a list line may not. */
const MAX_NAMED_CITATIONS = 6;

/**
 * What a finding cites, in words rather than ids.
 *
 * A bare count said nothing about which runs, and a list of ObjectIds is no
 * better: the model cannot tell from one whether the conclusion covers the runs
 * it is currently asking about. Names are the whole difference between a
 * citation it can build on and one it has to go look up.
 */
const cites = (finding: Finding): string => {
  if (finding.trainingIds.length === 0) return '';

  const named = finding.citedTrainings.map((run) => run.name);
  if (named.length === 0) return `, cites ${count(finding.trainingIds.length)} runs`;

  // Fewer names than citations means the rest are in a project this key cannot
  // see. Worth saying: the conclusion rests on more than is being shown.
  const hidden = finding.trainingIds.length - named.length;
  const shown = named.slice(0, MAX_NAMED_CITATIONS);
  const more = named.length > shown.length ? ` +${count(named.length - shown.length)} more` : '';
  const unseen = hidden > 0 ? `, ${count(hidden)} not visible to this key` : '';

  return `, cites ${shown.join(', ')}${more}${unseen}`;
};

const describe = (finding: Finding): string =>
  `- ${finding.title} — ${finding.authorLabel}, ${day(finding.createdAt)}${cites(finding)}  [${finding._id}]`;

function registerReadTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_findings',
    {
      title: 'Recorded analysis',
      description:
        'Conclusions already written about a project or a run, by you in an earlier session or ' +
        'by a person in the app. Read this before analysing something from scratch — the answer ' +
        'may already be recorded, and building on it beats deriving it again.',
      inputSchema: {
        project: z.string().optional().describe('Project slug or id, from list_projects'),
        training: z
          .string()
          .optional()
          .describe('Training id — matches findings about that run or citing it'),
        limit: z.number().int().min(1).max(50).optional().describe('How many (default 20)')
      }
    },
    async ({ project, training, limit }) => {
      try {
        const findings = await vision.listFindings(key, { project, training, limit: limit ?? 20 });

        if (findings.length === 0) {
          return ok('Nothing has been recorded yet for that.');
        }

        const { shown, note } = capped(findings, 50, 'findings');
        return ok(
          [`${count(findings.length)} recorded:`, ...shown.map(describe), '', 'Use get_finding to read one in full.'].join(
            '\n'
          ) + note
        );
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_finding',
    {
      title: 'Read one analysis',
      description: 'The full text of a recorded conclusion, with the runs it draws on.',
      inputSchema: {
        finding: z.string().describe('The finding id, from list_findings'),
        format: z
          .enum(['text', 'latex'])
          .optional()
          .describe(
            'Use "latex" to get the finding as a paper section — a \\subsection with the prose ' +
              'and a booktabs results table built from the cited runs\' recorded epochs. Hand it ' +
              'to the user to paste into a paper; do not retype the numbers yourself.'
          ),
        selectBy: z
          .string()
          .optional()
          .describe(
            'latex only: the metric deciding which epoch each run is reported at, e.g. ' +
              '"val.mean_iou". Omit to report each run at its final epoch.'
          ),
        direction: z
          .enum(['max', 'min'])
          .optional()
          .describe('latex only: whether the best value of selectBy is its highest or lowest'),
        metrics: z
          .array(z.string())
          .max(6)
          .optional()
          .describe('latex only: which metrics become table columns, in order')
      }
    },
    async ({ finding, format, selectBy, direction, metrics }) => {
      try {
        if (format === 'latex') {
          const { filename, tex } = await vision.exportFinding(key, finding, {
            selectBy,
            direction,
            metrics: metrics?.join(',')
          });
          return ok(
            `${filename} — every number below was read from the recorded epochs, not ` +
              `transcribed. Paste as-is.\n\n${tex}`
          );
        }

        const record = await vision.getFinding(key, finding);

        const lines = [
          record.title,
          `${record.authorLabel} · ${day(record.createdAt)}`,
          '',
          record.body
        ];
        if (record.trainingIds.length > 0) {
          // Named with the id alongside, so the model can both read what the
          // conclusion rests on and pass those runs to another tool.
          const named = record.citedTrainings.map((run) => `${run.name} [${run._id}]`);
          const hidden = record.trainingIds.length - named.length;

          lines.push(
            '',
            named.length > 0
              ? `Draws on: ${named.join(', ')}` +
                  (hidden > 0 ? ` (and ${hidden} run(s) in a project this key cannot see)` : '')
              : `Draws on ${record.trainingIds.length} run(s): ${record.trainingIds.join(', ')}`
          );
        }
        if (record.recommendations) {
          lines.push('', 'Suggested next run:', record.recommendations);
        }
        return ok(lines.join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );
}

function registerWriteTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'record_finding',
    {
      title: 'Record an analysis',
      description:
        'Write a conclusion onto a project so it survives this conversation. Use when you have ' +
        'worked something out worth keeping — which configuration wins and under what conditions, ' +
        'why a run failed, what an ablation shows. Cite the runs you drew on: a conclusion whose ' +
        'evidence cannot be checked is worth much less than one whose can. Say what you found, ' +
        'not what you assume — and do not record a guess as a result. ' +
        'Write it short. A finding is read later by someone deciding what to do next, and by ' +
        'get_finding(format:"latex") which turns it into a paper section — both want the result ' +
        'and the number behind it, not the reasoning that reached them. No preamble, no restating ' +
        'the question, no summary of what you did. Three short paragraphs is a lot.',
      inputSchema: {
        project: z.string().describe('Project slug or id, from list_projects'),
        title: z.string().min(1).max(200).describe('One line naming the conclusion'),
        body: z
          .string()
          .min(1)
          .max(20_000)
          .describe(
            'The analysis itself, in markdown, kept tight — state the result and the numbers ' +
              'behind it and stop. Do not build a results table by hand: the LaTeX export ' +
              'generates one from the cited runs\' recorded epochs, so a table typed here is ' +
              'both duplicated and, being retyped, the one place a wrong number can enter.'
          ),
        recommendations: z
          .string()
          .max(5_000)
          .optional()
          .describe(
            'What to change for the next run, if the result suggests something concrete — a ' +
              'setting and the value to try, not a direction to think in. Name current values ' +
              'from get_training rather than guessing at them. Kept out of the paper section: ' +
              'the export writes it as a comment, since a reviewer should never read it.'
          ),
        training: z.string().optional().describe('The run it is about, if it is about one'),
        trainingIds: z
          .array(z.string())
          .max(50)
          .optional()
          .describe('Every run the conclusion draws on, so a reader can check it')
      }
    },
    async ({ project, title, body, recommendations, training, trainingIds }) => {
      try {
        const finding = await vision.createFinding(key, {
          project,
          title,
          body,
          recommendations,
          training,
          trainingIds
        });

        return ok(
          `Recorded "${finding.title}" on ${project}. It is visible in the app and to later ` +
            'sessions via list_findings, and can be exported as a paper section with ' +
            `get_finding(format:"latex").  [${finding._id}]`
        );
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const analysisRead: ToolModule = { scopes: ['analysis:read'], register: registerReadTools };
export const analysisWrite: ToolModule = {
  scopes: ['analysis:write'],
  register: registerWriteTools
};
