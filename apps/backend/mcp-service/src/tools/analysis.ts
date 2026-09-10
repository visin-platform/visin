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
        limit: z.number().int().min(1).max(50).optional().describe('How many (default 20)'),
        before: z.string().length(49).optional().describe('Continuation cursor from the previous list_findings page; keep the same filters')
      }
    },
    async ({ project, training, limit, before }) => {
      try {
        const findings = await vision.listFindings(key, { project, training, limit: limit ?? 20, before });

        if (findings.length === 0) {
          return ok(before ? 'No more findings.' : 'Nothing has been recorded yet for that.');
        }

        const { shown, note } = capped(findings, 50, 'findings');
        const last = shown[shown.length - 1];
        const continuation = findings.length >= (limit ?? 20)
          ? `\nFor older findings, call list_findings with the same filters and before="${last.createdAt}_${last._id}". An empty page means the end.`
          : '';
        return ok(
          [`${count(findings.length)} recorded:`, ...shown.map(describe), '', 'Use get_finding to read one in full.'].join(
            '\n'
          ) + note + continuation
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
      description:
        'The full text of a recorded conclusion, with the runs it draws on. With format:"latex", ' +
        'a paper section whose results table is generated from those runs\' recorded epochs — ' +
        'hand it over as-is rather than retyping any of it.',
      inputSchema: {
        finding: z.string().describe('The finding id, from list_findings'),
        format: z
          .enum(['text', 'latex'])
          .optional()
          .describe('"latex" returns it as a paper section with a generated results table'),
        selectBy: z
          .string()
          .optional()
          .describe('latex: metric choosing each run\'s epoch, e.g. "val.mean_iou". Default: last epoch'),
        direction: z.enum(['max', 'min']).optional().describe('latex: is selectBy better high or low'),
        metrics: z.array(z.string()).max(6).optional().describe('latex: table columns, in order')
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
        'Write a conclusion onto a project so it survives this conversation — which configuration ' +
        'wins and under what conditions, why a run failed, what an ablation shows. Cite the runs ' +
        'it draws on. Record what you found, never a guess. Keep it short: the result and the ' +
        'numbers behind it, no preamble.',
      inputSchema: {
        project: z.string().describe('Project slug or id, from list_projects'),
        title: z.string().min(1).max(200).describe('One line naming the conclusion'),
        body: z
          .string()
          .min(1)
          .max(20_000)
          .describe(
            'The analysis, in markdown. No hand-written results table — the LaTeX export builds ' +
              'one from the recorded epochs, and retyping is where a wrong number gets in.'
          ),
        recommendations: z
          .string()
          .max(5_000)
          .optional()
          .describe(
            'What to change next run: a setting and the value to try. Take current values from ' +
              'get_training. Kept out of the paper section.'
          ),
        training: z.string().optional().describe('The run it is about, if it is about one'),
        trainingIds: z
          .array(z.string())
          .max(50)
          .optional()
          .describe('Every run the conclusion draws on, so a reader can check it')
      },
      // A finding is only ever added. Nothing here edits or removes one.
      annotations: { destructiveHint: false }
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
