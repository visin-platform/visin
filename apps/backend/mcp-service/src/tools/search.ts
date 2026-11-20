import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { datasets } from '../datasets';
import { vision } from '../vision';
import { Caller, ToolModule, count, explain, ok } from './module';

/**
 * One look across Visin for a topic: projects, runs, datasets, papers and suites together.
 *
 * It composes the same reads the single-purpose tools make, with the caller's own key, so what it finds is exactly
 * what that person could find one tool at a time, and nothing more. A search on names and descriptions misses a
 * topic put in other words ("autonomous vehicles" for a project about driving), so it takes several terms at once:
 * the question's own words and a few synonyms cost one call, not one round each.
 */

const MAX_TERMS = 6;

const TOPIC_NOTE =
  'A hit is a name or description that contains one of the words, not proof a project is about the topic: read the ' +
  'ones that look relevant before saying so. "None found" means none among what this person can see; never say a ' +
  'private item does not exist.';

/** One kind of thing found, merged across the terms so a hit found by two of them is listed once. */
interface Hits {
  kind: string;
  /** a link relative to the Visin app, which the person can open */
  lines: Map<string, string>;
  /** how many there are in all, when the service says and it is more than were read */
  total?: number;
  failed?: string;
}

/**
 * The terms as one MongoDB text search, which matches any of its words (and their stems): one request for all of
 * them, not one per term. A quote or a leading hyphen means a phrase or "not" there, so neither is passed on.
 */
export const textSearchOf = (terms: string[]): string =>
  terms
    .map((term) =>
      term
        .replace(/"/g, ' ')
        .replace(/(^|\s)-+/g, '$1')
        .trim()
    )
    .filter(Boolean)
    .join(' ');

const oneLine = (text: string | undefined, max = 140): string => {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const withDescription = (name: string, description: string | undefined) =>
  description ? `${name} — ${oneLine(description)}` : name;

function registerSearchTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'search_visin',
    {
      title: 'Search Visin',
      description:
        'Find what Visin holds on a topic in one call: projects, runs, datasets, papers and suites the caller can see, ' +
        'each with its id and a link. Use it first for "does Visin have anything about X", "which projects use Y" and ' +
        "any question that names a topic rather than one known item. Pass the person's own words AND a few synonyms or " +
        'related terms as `terms` (for "autonomous vehicles": "autonomous vehicles", "driving", "traffic", "road", ' +
        '"lidar"). Then read the promising hits with get_project, get_dataset, get_training or get_paper.',
      inputSchema: {
        terms: z
          .array(z.string().min(2).max(100))
          .min(1)
          .max(MAX_TERMS)
          .describe("The topic in the person's words, plus synonyms and related terms (up to six)"),
        limit: z.number().int().min(1).max(15).optional().describe('How many of each kind to show (default 8)')
      }
    },
    async ({ terms, limit }) => {
      try {
        const each = limit ?? 8;
        const unique = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))].slice(
          0,
          MAX_TERMS
        );
        const anyOf = textSearchOf(unique);

        const projects: Hits = { kind: 'Projects', lines: new Map() };
        const runs: Hits = { kind: 'Runs', lines: new Map() };
        const sets: Hits = { kind: 'Datasets', lines: new Map() };
        const papers: Hits = { kind: 'Papers', lines: new Map() };
        const suites: Hits = { kind: 'Suites', lines: new Map() };

        // A kind that cannot be read (a key without that scope, a service down) is named, not silently empty.
        const attempt = async (hits: Hits, work: () => Promise<void>) => {
          try {
            await work();
          } catch (error) {
            const reason = explain(error).content[0];
            hits.failed = reason && 'text' in reason ? String(reason.text) : 'could not be searched';
          }
        };

        await Promise.all([
          // Projects and runs are found by a text index: every term in one request.
          attempt(projects, async () => {
            for (const project of await vision.listProjects(key, anyOf))
              projects.lines.set(
                project._id,
                `- ${withDescription(project.name, project.description)} (${project.visibility})  [${project._id}]  /projects/${project._id}`
              );
          }),
          attempt(runs, async () => {
            const found = await vision.listTrainings(key, { search: anyOf, limit: each });
            for (const run of found.trainings)
              runs.lines.set(
                run._id,
                `- ${withDescription(run.name, run.description)}  [${run._id}]  /trainings/${run._id}`
              );
            runs.total = found.pagination?.total;
          }),
          // Dataset names and descriptions match any of the substrings in one request.
          attempt(sets, async () => {
            const found = await datasets.list(key, { searchTerms: JSON.stringify(unique), limit: each });
            for (const dataset of found.datasets)
              sets.lines.set(
                dataset._id,
                `- ${withDescription(dataset.name, dataset.description?.split('\n')[0])} (${count(dataset.imageCount)} images)  [${dataset._id}]  /datasets/${dataset._id}`
              );
            sets.total = found.pagination?.total;
          }),
          // Papers one term at a time: a term that is an arXiv id or a DOI finds that paper exactly, not by its words.
          attempt(papers, async () => {
            for (const found of await Promise.all(unique.map((term) => vision.listPapers(key, term, each))))
              for (const paper of found.papers)
                papers.lines.set(
                  paper.id,
                  `- ${paper.title}${paper.year ? ` (${paper.year})` : ''}  [${paper.id}]  /papers/${paper.id}`
                );
          }),
          // Suites by their name, slug, description or task: the server matches a substring, so one request per term.
          attempt(suites, async () => {
            for (const found of await Promise.all(unique.map((term) => vision.listSuites(key, { search: term, limit: each }))))
              for (const suite of found.suites)
                suites.lines.set(
                  `${suite.slug}@${suite.version}`,
                  `- ${withDescription(`${suite.name} (${suite.slug}@${suite.version})`, suite.protocol.task)}  /suites/${suite.slug}/${suite.version}`
                );
          })
        ]);

        const sections = [projects, sets, papers, runs, suites].flatMap((hits) => {
          if (hits.failed) return [`${hits.kind}: not searched (${oneLine(hits.failed, 100)})`];
          if (hits.lines.size === 0) return [];
          const shown = [...hits.lines.values()].slice(0, each);
          const all = Math.max(hits.lines.size, hits.total ?? 0);
          const more = all - shown.length;
          return [
            `${hits.kind} (${count(all)}):`,
            ...shown,
            ...(more > 0
              ? [`  …and ${count(more)} more; narrow the search or list them with the tool for that kind`]
              : [])
          ];
        });

        const searched = `Searched for: ${unique.map((term) => `“${term}”`).join(', ')}.`;
        if (!sections.some((line) => !line.includes('not searched')))
          return ok(
            [searched, 'Nothing among what you can see matches any of those words.', ...sections, TOPIC_NOTE].join('\n')
          );
        return ok([searched, '', ...sections, '', TOPIC_NOTE].join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );
}

/** Needs both scopes: the datasets are another service's, and a key without that scope is not offered a search that skips them. */
export const searchRead: ToolModule = { scopes: ['vision:read', 'dataset:read'], register: registerSearchTools };
