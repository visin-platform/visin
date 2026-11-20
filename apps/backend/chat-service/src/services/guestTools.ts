import { ForbiddenError, fetchWithTimeout, ServiceUnavailableError } from '@visin/backend-core';
import type { ToolCall, ToolOutput, ToolSpec } from './providers';
import { GUEST_REQUEST_BYTES, publicProject } from './guestContext';
import { publicRun, runProjectId } from './guestRun';

/**
 * What a visitor's Vivi may look up beyond the context fetched for the question: the public catalogue, asked of
 * vision-service with no credential of any kind, so it can return only what Explore shows anyone. The tools run here,
 * in chat-service. mcp-service is never opened to a caller who has not signed in: every tool's code path would then be
 * reachable without auth.
 *
 * What a lookup may cost is the administrator's: how many rounds (`guestToolRounds`) and how much one result may
 * carry (`guestToolResultBytes`). Both are counted into what a question reserves of the spend ceiling.
 */

/** A lookup that finds no more than this is shown whole; a longer list is for narrowing the search. */
const SEARCH_RESULTS = 6;
const PAPER_RESULTS = 5;
/** Lookups answered in one round; a model that asks for more is told to ask for fewer, and every call still gets a reply. */
export const MAX_CALLS_PER_ROUND = 3;
/**
 * What one lookup adds to the next request beyond its result: the model's call (an id, a name and up to 150 characters
 * of argument, escaped) and the result's own wrapper (the id it answers, its type, whether it failed).
 */
const CALL_BYTES = 560;
const RESULT_WRAPPER_BYTES = 160;
/** The most bytes a token of the model's own text can take, for sizing the words it writes before its calls. */
const BYTES_PER_TOKEN = 4;
const MAX_PAGE_BYTES = 512_000;

export const GUEST_TOOLS: ToolSpec[] = [
  {
    name: 'search_public_projects',
    description:
      'Find public projects by topic. Give the words a project might use, not a sentence. Returns each one’s name, a line on what it studies and its link.',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', maxLength: 100 } },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'read_public_project',
    description:
      'Read one public project: what it studies, its topics and its readme. Give its link exactly as a search returned it.',
    schema: {
      type: 'object',
      properties: { link: { type: 'string', maxLength: 150 } },
      required: ['link'],
      additionalProperties: false
    }
  },
  {
    name: 'search_public_papers',
    description:
      'Find public research papers by topic, title or author. Returns each one’s title, authors, year, a short summary and its link.',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', maxLength: 100 } },
      required: ['query'],
      additionalProperties: false
    }
  },
  ...['search_public_runs', 'read_public_run', 'read_public_paper'].map((name) => ({
    name,
    description:
      name === 'search_public_runs'
        ? 'Find public training runs by name or topic.'
        : `Read a ${name === 'read_public_run' ? 'public run' : 'public paper'} using its link.`,
    schema: {
      type: 'object' as const,
      properties: { [name === 'search_public_runs' ? 'query' : 'link']: { type: 'string', maxLength: 150 } },
      required: [name === 'search_public_runs' ? 'query' : 'link'],
      additionalProperties: false
    }
  }))
];
const TOOLS_BYTES = Buffer.byteLength(JSON.stringify(GUEST_TOOLS), 'utf8');

export interface GuestToolLimits {
  /** 0: no lookups, one request. */
  rounds: number;
  resultBytes: number;
}
export const guestToolLimits = (policy: {
  guestToolRounds: number;
  guestToolResultBytes: number;
}): GuestToolLimits => ({
  rounds: policy.guestToolRounds,
  resultBytes: policy.guestToolResultBytes
});

/**
 * The most one provider request may carry. With no lookups it is the usual guest ceiling. With them, a request also
 * carries the tool definitions, and from every earlier round the model's own message (any words it wrote before its
 * calls, up to its output cap, and the calls themselves) and the results with their wrappers: the cost of a question
 * is bounded by this times its requests, which is what it reserves. `outputTokens` is the cap on one answer.
 */
export const guestRequestBytes = (limits: GuestToolLimits, outputTokens: number): number =>
  limits.rounds === 0
    ? GUEST_REQUEST_BYTES
    : GUEST_REQUEST_BYTES +
      TOOLS_BYTES +
      limits.rounds *
        (outputTokens * BYTES_PER_TOKEN +
          MAX_CALLS_PER_ROUND * (CALL_BYTES + RESULT_WRAPPER_BYTES + limits.resultBytes));

/** Provider requests one question may make: its first, and one more after each round of lookups. */
export const guestRequests = (limits: GuestToolLimits): number => limits.rounds + 1;

/** What a lookup touched, so the answer is shown only while every one of them is still public. */
export interface GuestSeen {
  projectIds: Set<string>;
  paperIds: Set<string>;
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const cut = (text: string, max: number) =>
  Buffer.from(text).subarray(0, Math.max(0, max)).toString('utf8').replace(/�+$/, '');
/** A string's size as the provider's request carries it: escaped inside JSON, where quotes and newlines take two bytes. */
const sent = (text: string) => bytes(JSON.stringify(text)) - 2;
/** `text` cut so that, once escaped into a request, it takes at most `max` bytes. */
const fitSent = (text: string, max: number): string => {
  let keep = Math.min(bytes(text), max);
  let out = cut(text, keep);
  while (sent(out) > max && keep > 0) out = cut(text, (keep = Math.floor(keep * 0.9)));
  return out;
};
const words = (value: unknown, max: number) =>
  typeof value === 'string' ? cut(value.replace(/\s+/g, ' ').trim(), max) : '';

/** One of vision's public reads, asked with no credential. Anything but a plain answer is the lookup being unavailable. */
async function publicJson(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const url = new URL(path, process.env.VISION_SERVICE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchWithTimeout(url, {
    redirect: 'error',
    cache: 'no-store',
    signal,
    serviceName: 'vision-service'
  });
  const text = response.ok ? await response.text() : '';
  if (!response.ok || bytes(text) > MAX_PAGE_BYTES) throw new ServiceUnavailableError('Public catalogue unavailable');
  try {
    return (JSON.parse(text) as { data?: unknown }).data;
  } catch {
    throw new ServiceUnavailableError('Public catalogue unavailable');
  }
}
const list = (value: unknown, key: string): Record<string, unknown>[] => {
  const rows = (value as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : [];
};

const ID = /^[a-f\d]{24}$/i;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

/** A paper that is no longer public (or never was) is refused, as a project is: its words must not be shown. */
export async function assertPublicPaper(id: string, signal: AbortSignal): Promise<void> {
  if (!ID.test(id)) throw new ForbiddenError('This paper is not publicly available');
  const response = await fetchWithTimeout(new URL(`/api/public/papers/${id}`, process.env.VISION_SERVICE_URL), {
    redirect: 'error',
    cache: 'no-store',
    signal,
    serviceName: 'vision-service'
  });
  if ([401, 403, 404].includes(response.status)) throw new ForbiddenError('This paper is not publicly available');
  if (!response.ok) throw new ServiceUnavailableError('Public paper data is unavailable right now');
  const body = (await response.json().catch(() => null)) as {
    data?: { visibility?: unknown; trashedAt?: unknown };
  } | null;
  if (body?.data?.visibility !== 'public' || body.data.trashedAt)
    throw new ForbiddenError('This paper is not publicly available');
}

async function searchProjects(query: string, seen: GuestSeen, signal: AbortSignal) {
  const data = await publicJson('/api/public/projects', { search: query, limit: String(SEARCH_RESULTS) }, signal);
  const found = list(data, 'projects').flatMap((card) => {
    const id = typeof card.id === 'string' && ID.test(card.id) ? card.id : '';
    const name = words(card.name, 120);
    if (!id || !name) return [];
    seen.projectIds.add(id);
    const slug = typeof card.slug === 'string' && SLUG.test(card.slug) ? card.slug : id;
    return [{ name, about: words(card.description, 200), link: `/projects/${slug}` }];
  });
  return found.length
    ? JSON.stringify(found)
    : 'No public project matches those words. Try other words, or answer without one.';
}

async function readProject(link: string, seen: GuestSeen, signal: AbortSignal, room: number) {
  const target = /^\/projects\/([a-z0-9][a-z0-9_-]{0,119})$/i.exec(link.trim())?.[1];
  if (!target) return 'That is not a project link. Use a link a search returned.';
  const project = await publicProject(target, signal);
  seen.projectIds.add(project.id);
  // The readme takes what the rest leaves, so the result is as useful as its size allows.
  const head = JSON.stringify({
    name: project.name,
    about: project.description,
    ...(project.topics ? { topics: project.topics } : {}),
    link: project.link
  });
  return JSON.stringify({
    ...JSON.parse(head),
    readme: cut(project.readme, Math.max(0, room - bytes(head) - 40))
  });
}

async function searchPapers(query: string, seen: GuestSeen, signal: AbortSignal) {
  const data = await publicJson('/api/public/papers', { search: query, limit: String(PAPER_RESULTS) }, signal);
  const found = list(data, 'papers').flatMap((card) => {
    const id = typeof card.id === 'string' && ID.test(card.id) ? card.id : '';
    const title = words(card.title, 200);
    if (!id || !title || card.visibility !== 'public') return [];
    seen.paperIds.add(id);
    const authors = (Array.isArray(card.authors) ? card.authors : [])
      .slice(0, 3)
      .map((author) => words((author as { name?: unknown })?.name, 60))
      .filter(Boolean);
    return [
      {
        title,
        ...(authors.length ? { authors } : {}),
        ...(typeof card.year === 'number' ? { year: card.year } : {}),
        summary: words(card.abstract, 220),
        link: `/papers/${id}`
      }
    ];
  });
  return found.length
    ? JSON.stringify(found)
    : 'No public paper matches those words. Try other words, or answer without one.';
}

async function searchRuns(query: string, seen: GuestSeen, signal: AbortSignal) {
  const data = await publicJson('/api/public/trainings', { search: query, limit: String(SEARCH_RESULTS) }, signal);
  const found = list(data, 'trainings').flatMap((row) => {
    const id = String(row._id ?? row.id ?? '');
    const projectId = String(row.projectId ?? '');
    const name = words(row.name, 120);
    if (!ID.test(id) || !ID.test(projectId) || !name) return [];
    seen.projectIds.add(projectId);
    return [{ name, status: words(row.status, 30), link: `/trainings/${id}` }];
  });
  return found.length ? JSON.stringify(found) : 'No public run matches those words.';
}

async function readRun(link: string, seen: GuestSeen, signal: AbortSignal) {
  const id = /^\/trainings\/([a-f\d]{24})$/i.exec(link)?.[1];
  if (!id) return 'Give a public run link.';
  const projectId = await runProjectId(id, signal);
  if (!projectId) throw new ForbiddenError('Run unavailable');
  await publicProject(projectId, signal);
  seen.projectIds.add(projectId);
  return JSON.stringify((await publicRun({ trainingId: id, projectId, question: '', signal })).run);
}

async function readPaper(link: string, seen: GuestSeen, signal: AbortSignal) {
  const id = /^\/papers\/([a-f\d]{24})$/i.exec(link)?.[1];
  if (!id) return 'Give a public paper link.';
  await assertPublicPaper(id, signal);
  const paper = (await publicJson(`/api/public/papers/${id}`, {}, signal)) as Record<string, unknown>;
  if (paper.visibility !== 'public') throw new ForbiddenError('Paper unavailable');
  seen.paperIds.add(id);
  // Names only: an author is also an account, and what identifies it is not for a visitor's answer.
  const authors = (Array.isArray(paper.authors) ? paper.authors : [])
    .slice(0, 6)
    .map((author) => words((author as { name?: unknown })?.name, 60))
    .filter(Boolean);
  return JSON.stringify({
    title: words(paper.title, 200),
    abstract: words(paper.abstract, 4000),
    ...(authors.length ? { authors } : {}),
    ...(typeof paper.year === 'number' ? { year: paper.year } : {}),
    link
  });
}

/**
 * Runs one lookup and returns what the model reads. A result is data, never instructions, and is cut to the limit; a
 * lookup that fails says only that it is unavailable, never why, so nothing of the service behind it reaches a
 * visitor's answer.
 */
export async function runGuestTool(
  call: ToolCall,
  input: { limits: GuestToolLimits; seen: GuestSeen; signal: AbortSignal; allowed: boolean }
): Promise<ToolOutput> {
  const output = (content: string, isError = false): ToolOutput => ({ id: call.id, content, isError });
  if (!input.allowed) return output('Too many lookups at once: ask for fewer, or answer from what you have.', true);
  const text = (name: string) =>
    typeof call.input[name] === 'string' ? (call.input[name] as string).trim().slice(0, 150) : '';
  try {
    let result: string;
    if (call.name === 'search_public_projects') {
      const query = text('query').slice(0, 100);
      result = query ? await searchProjects(query, input.seen, input.signal) : 'Give some words to search for.';
    } else if (call.name === 'read_public_project')
      result = await readProject(text('link'), input.seen, input.signal, input.limits.resultBytes);
    else if (call.name === 'search_public_papers') {
      const query = text('query').slice(0, 100);
      result = query ? await searchPapers(query, input.seen, input.signal) : 'Give some words to search for.';
    } else if (call.name === 'search_public_runs') {
      const query = text('query').slice(0, 100);
      result = query ? await searchRuns(query, input.seen, input.signal) : 'Give some words to search for.';
    } else if (call.name === 'read_public_run') result = await readRun(text('link'), input.seen, input.signal);
    else if (call.name === 'read_public_paper') result = await readPaper(text('link'), input.seen, input.signal);
    else return output('That lookup does not exist.', true);
    // Counted as the request carries it, so a result never takes more of a request than the limit it was reserved at.
    const CUT = '\n[CUT: ask for something narrower]';
    return output(
      sent(result) > input.limits.resultBytes
        ? `${fitSent(result, input.limits.resultBytes - sent(CUT))}${CUT}`
        : result
    );
  } catch (error) {
    // A project made private since reads as not found: said so, without saying it was ever there.
    return output(
      error instanceof ForbiddenError ? 'Not among the public ones.' : 'That lookup is unavailable right now.',
      true
    );
  }
}
