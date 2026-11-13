import { BadRequestError, fetchWithTimeout, ForbiddenError, ServiceUnavailableError } from '@visin/backend-core';
import { searchPublicProjects } from './guestCatalogue';
import { linkedPage, publicRun, runProjectId, type PublicRunContext } from './guestRun';

export interface PublicProjectContext {
  id: string;
  name: string;
  description: string;
  /** Where the visitor opens it: an app path, so Vivi links the project instead of naming an id. */
  link: string;
  /** What the project's page says it studies: task, classes, conditions and metrics from its taxonomy. */
  topics?: { task?: string; classes?: string[]; conditions?: string[]; metrics?: string[] };
  /** The project's readme, the fullest public account of what it studies and how. */
  readme: string;
}

const MAX_PROJECT_BYTES = 128_000;
/** Projects a search hands to Vivi: enough to choose from, few enough that each keeps a useful description. */
const SEARCHED = 8;
/**
 * One guest request, system prompt included, in bytes. The cost reservation counts a token per byte, the worst case,
 * so the request can never cost more than was reserved for it.
 */
export const GUEST_REQUEST_BYTES = 11_000;
/** The provider request around the prompt and context: model, limits, roles, the wrapper text and JSON keys. */
const ENVELOPE_BYTES = 600;
/**
 * What the question and its context may take of one guest request, measured as sent (escaped inside the request's
 * JSON), leaving room for the system prompt and the request's envelope.
 */
export const GUEST_CONTEXT_BYTES = 8000;

/** What is left for the question and context once this system prompt is in the request, at most the usual share. */
export const guestContextRoom = (system: string): number =>
  Math.min(GUEST_CONTEXT_BYTES, GUEST_REQUEST_BYTES - sent(system) - ENVELOPE_BYTES);
const MAX_README = 4000;
const MAX_TOPIC_ITEMS = 12;

const DISCOVERY_WORDS = new Set([
  'find',
  'show',
  'list',
  'public',
  'computer',
  'vision',
  'project',
  'projects',
  'what',
  'which',
  'are',
  'the',
  'a',
  'an',
  'me',
  'about',
  'does',
  'do',
  'study',
  'studies',
  'work',
  'on',
  'in',
  'of',
  'for',
  'can',
  'you',
  'please',
  'all',
  'any'
]);

/** A visitor's last question and answer, and the public projects that answer drew on. */
export interface PreviousExchange {
  question: string;
  answer: string;
  projectIds: string[];
}
/** How long a follow-up still follows: after this, a question starts afresh. */
export const FOLLOW_UP_MS = 30 * 60_000;

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
/** Bytes as sent: a string's size once escaped into the provider request's JSON. */
const sent = (text: string) => bytes(JSON.stringify(text)) - 2;
const cut = (text: string, max: number) =>
  Buffer.from(text).subarray(0, Math.max(0, max)).toString('utf8').replace(/�+$/, '');

/** A project as anyone may see it. No credential of any kind is sent: vision's public API is the boundary. */
export async function publicProject(id: string, signal: AbortSignal): Promise<PublicProjectContext> {
  const response = await fetchWithTimeout(
    new URL(`/api/projects/${encodeURIComponent(id)}`, process.env.VISION_SERVICE_URL),
    { redirect: 'error', cache: 'no-store', signal, serviceName: 'vision-service', streamBody: true }
  );
  // Without a credential, vision answers a private or missing project as not found (or not allowed). Anything else
  // is vision failing, which must not be reported to a visitor as the project being private.
  if (response.status === 404 || response.status === 403 || response.status === 401)
    throw new ForbiddenError('This project is not publicly available');
  if (!response.ok || !response.body) throw new ServiceUnavailableError('Public project data is unavailable right now');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > MAX_PROJECT_BYTES) {
      await reader.cancel();
      throw new BadRequestError('Public project context is too large');
    }
    chunks.push(next.value);
  }
  let parsed: { data?: unknown } & Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ServiceUnavailableError('Public project data is unavailable right now');
  }
  const project = (parsed.data ?? parsed) as {
    _id?: unknown;
    name?: unknown;
    slug?: unknown;
    description?: unknown;
    readme?: unknown;
    taxonomy?: unknown;
    visibility?: unknown;
  };
  if (project.visibility !== 'public') throw new ForbiddenError('Only public projects are available to guest Vivi');
  const projectId = String(project._id);
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw new BadRequestError('Public project identity is unavailable');
  const slug = typeof project.slug === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(project.slug) ? project.slug : '';
  const topics = taxonomyTopics(project.taxonomy);
  return {
    id: projectId,
    name: cut(String(project.name || ''), 200),
    description: cut(String(project.description || ''), 2000),
    link: `/projects/${slug || projectId}`,
    ...(topics ? { topics } : {}),
    readme: cut(typeof project.readme === 'string' ? project.readme.trim() : '', MAX_README)
  };
}

/** The labels a taxonomy shows on the project's page, as short lists; nothing when it names none. */
function taxonomyTopics(taxonomy: unknown): PublicProjectContext['topics'] | undefined {
  if (!taxonomy || typeof taxonomy !== 'object') return undefined;
  const t = taxonomy as { taskType?: unknown; classes?: unknown; conditions?: unknown; overallMetrics?: unknown };
  const labels = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .map((item) =>
        typeof item === 'string'
          ? item
          : String((item as { label?: unknown; key?: unknown })?.label ?? (item as { key?: unknown })?.key ?? '')
      )
      .filter(Boolean)
      .slice(0, MAX_TOPIC_ITEMS)
      .map((label) => cut(label, 40));
  const topics = {
    ...(typeof t.taskType === 'string' && t.taskType ? { task: cut(t.taskType, 40) } : {}),
    ...(labels(t.classes).length ? { classes: labels(t.classes) } : {}),
    ...(labels(t.conditions).length ? { conditions: labels(t.conditions) } : {}),
    ...(labels(t.overallMetrics).length ? { metrics: labels(t.overallMetrics) } : {})
  };
  return Object.keys(topics).length ? topics : undefined;
}

/**
 * The public material a guest question is answered from. The project the visitor is looking at (or asked about),
 * when there is one. Otherwise the public projects whose name or description match the question's words, and then,
 * up to a handful, the rest of the newest public projects: a question rarely uses a project's own words ("autonomous
 * driving" for a readme about ZOD and Waymo), so Vivi is shown what there is and judges relevance from the readmes.
 * Everything is fitted into the request's byte budget, shortening readmes and descriptions first, so a guest
 * question still costs at most what was reserved for it. Ids stay here; the model sees only names and links.
 */
export async function guestContext(input: {
  question: string;
  projectId?: string;
  /** The run on the visitor's page, when it is one of that project's. */
  trainingId?: string;
  signal: AbortSignal;
  room?: number;
  /** The visitor's last exchange in this session, for a follow-up question. */
  previous?: PreviousExchange;
}) {
  let projects: (PublicProjectContext & { matched?: boolean })[];
  let found: 'page' | 'search';
  let page: PublicRunContext | undefined;
  // A link pasted into the question names its page as surely as being on it does.
  const linked = linkedPage(input.question);
  const trainingId = linked.trainingId ?? input.trainingId;
  const projectId =
    (linked.trainingId ? await runProjectId(linked.trainingId, input.signal).catch(() => undefined) : undefined) ??
    linked.projectId ??
    input.projectId;
  const before = input.previous;
  // The last answer is repeated to the model only while every project it drew on is still public and in view.
  let followUp = Boolean(before);
  // The page's own project must be public, or the question is refused. A linked one that is not is only a link
  // that led nowhere: the answer falls back to the page, or to searching.
  let first =
    projectId && projectId !== input.projectId
      ? await publicProject(projectId, input.signal).catch(() => undefined)
      : undefined;
  if (!first && input.projectId) first = await publicProject(input.projectId, input.signal);
  if (first) {
    projects = [first];
    found = 'page';
    // A run that is not this public project's (or cannot be read) is simply not part of the answer.
    if (trainingId)
      page = await publicRun({
        trainingId,
        projectId: projects[0].id,
        question: input.question,
        signal: input.signal
      }).catch(() => undefined);
    followUp &&= before!.projectIds.every((id) => id === projects[0].id);
  } else {
    // Catalogue search is full-text OR search, not a natural-language question interpreter.
    // Generic discovery requests should browse the catalogue rather than match 'project'.
    const query = input.question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}-]+/gu, ' ')
      .split(/\s+/)
      .filter((word) => word && !DISCOVERY_WORDS.has(word))
      .join(' ')
      .slice(0, 100);
    const matched = query ? await searchPublicProjects(query) : [];
    const others = matched.length < SEARCHED ? await searchPublicProjects('') : [];
    // What was just talked about comes first: "the first one" means one of those.
    const earlier = (before?.projectIds ?? []).slice(0, SEARCHED);
    const candidates = [
      ...earlier.map((id) => ({ id, matched: matched.some((m) => m.id === id) })),
      ...matched.filter((card) => !earlier.includes(card.id)).map((card) => ({ id: card.id, matched: true })),
      ...others
        .filter((card) => !earlier.includes(card.id) && !matched.some((m) => m.id === card.id))
        .map((card) => ({ id: card.id, matched: false }))
    ].slice(0, SEARCHED);
    const read = await Promise.allSettled(candidates.map((candidate) => publicProject(candidate.id, input.signal)));
    projects = read.flatMap((result, i) =>
      result.status === 'fulfilled' ? [{ ...result.value, ...(query ? { matched: candidates[i].matched } : {}) }] : []
    );
    found = 'search';
    followUp &&= earlier.every((id) => projects.some((project) => project.id === id));
  }
  const previous =
    followUp && before ? { question: cut(before.question, 300), answer: cut(before.answer, 1200) } : undefined;
  const room = (input.room ?? GUEST_CONTEXT_BYTES) - sent(input.question);
  // What the model sees: no ids, which are meaningless to a visitor and were being repeated in answers.
  const shown = (list: typeof projects) => list.map(({ id: _id, ...project }) => ({ ...project }));
  const shell = (list: typeof projects) =>
    JSON.stringify({
      found,
      ...(previous ? { previous } : {}),
      ...(page ? { run: page.run } : {}),
      projects: shown(list)
    });
  const bare = projects.map(({ topics: _topics, ...p }) => ({ ...p, description: '', readme: '' }));
  if (sent(shell(bare)) > room)
    throw new BadRequestError('Question and public context are too large. Ask a shorter question.');
  // Each project gets an equal share of what is left: its description first (short by design), then its topics and
  // readme.
  // Escaping (a readme's newlines and quotes, twice over) adds to that, so the share shrinks until the whole fits.
  // Topics come next when they take at most half of what is left; the readme gets the rest.
  const fit = (share: number) =>
    projects.map(({ topics, ...p }) => {
      const description = cut(p.description, Math.min(share, 500));
      const left = share - bytes(description);
      const kept = topics && sent(JSON.stringify(topics)) <= left / 2 ? topics : undefined;
      const readme = cut(p.readme, left - (kept ? sent(JSON.stringify(kept)) : 0));
      return { ...p, ...(kept ? { topics: kept } : {}), description, readme };
    });
  let share = projects.length ? Math.floor((room - sent(shell(bare))) / projects.length) : 0;
  let fitted = fit(share);
  while (share > 0 && sent(shell(fitted)) > room) fitted = fit((share = Math.floor(share * 0.9)));
  return { projects: fitted, text: shell(fitted), images: page?.images ?? [] };
}
