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

const describe = (finding: Finding): string => {
  const cites =
    finding.trainingIds.length > 0 ? `, cites ${count(finding.trainingIds.length)} runs` : '';
  return `- ${finding.title} — ${finding.authorLabel}, ${day(finding.createdAt)}${cites}  [${finding._id}]`;
};

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
      inputSchema: { finding: z.string().describe('The finding id, from list_findings') }
    },
    async ({ finding }) => {
      try {
        const record = await vision.getFinding(key, finding);

        const lines = [
          record.title,
          `${record.authorLabel} · ${day(record.createdAt)}`,
          '',
          record.body
        ];
        if (record.trainingIds.length > 0) {
          lines.push('', `Draws on: ${record.trainingIds.join(', ')}`);
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
        'not what you assume — and do not record a guess as a result.',
      inputSchema: {
        project: z.string().describe('Project slug or id, from list_projects'),
        title: z.string().min(1).max(200).describe('One line naming the conclusion'),
        body: z
          .string()
          .min(1)
          .max(20_000)
          .describe('The analysis itself, in markdown. State the evidence, not only the verdict.'),
        training: z.string().optional().describe('The run it is about, if it is about one'),
        trainingIds: z
          .array(z.string())
          .max(50)
          .optional()
          .describe('Every run the conclusion draws on, so a reader can check it')
      }
    },
    async ({ project, title, body, training, trainingIds }) => {
      try {
        const finding = await vision.createFinding(key, {
          project,
          title,
          body,
          training,
          trainingIds
        });

        return ok(
          `Recorded "${finding.title}" on ${project}. It is visible in the app and to later ` +
            `sessions via list_findings.  [${finding._id}]`
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
