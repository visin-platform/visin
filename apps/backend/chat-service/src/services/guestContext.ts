import { BadRequestError, fetchWithTimeout, ForbiddenError, ServiceUnavailableError } from '@visin/backend-core';
import { searchPublicProjects } from './guestCatalogue';

export interface PublicProjectContext {
  id: string;
  name: string;
  description: string;
}

const MAX_PROJECT_BYTES = 128_000;
/** Projects a search hands to Vivi: enough to choose from, few enough that each keeps a useful description. */
const SEARCHED = 8;
/** What the question and its context may take of one guest request, so the cost bound holds. */
export const GUEST_CONTEXT_BYTES = 4500;

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

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
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
    description?: unknown;
    visibility?: unknown;
  };
  if (project.visibility !== 'public') throw new ForbiddenError('Only public projects are available to guest Vivi');
  const projectId = String(project._id);
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw new BadRequestError('Public project identity is unavailable');
  return {
    id: projectId,
    name: cut(String(project.name || ''), 200),
    description: cut(String(project.description || ''), 2000)
  };
}

/**
 * The public material a guest question is answered from. The project the visitor is looking at (or asked about),
 * when there is one; otherwise the public projects that best match the question, found by searching the public
 * catalogue, so a visitor can simply ask. Everything is fitted into the request's byte budget, shortening
 * descriptions first, so a guest question still costs at most what was reserved for it.
 */
export async function guestContext(input: { question: string; projectId?: string; signal: AbortSignal }) {
  let projects: PublicProjectContext[];
  let found: 'page' | 'search';
  if (input.projectId) {
    projects = [await publicProject(input.projectId, input.signal)];
    found = 'page';
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
    const candidates = (await searchPublicProjects(query)).slice(0, SEARCHED);
    const read = await Promise.allSettled(candidates.map((candidate) => publicProject(candidate.id, input.signal)));
    projects = read.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    found = 'search';
  }
  const room = GUEST_CONTEXT_BYTES - bytes(input.question);
  const shell = (list: PublicProjectContext[]) => JSON.stringify({ found, projects: list });
  if (bytes(shell(projects.map((p) => ({ ...p, description: '' })))) > room)
    throw new BadRequestError('Question and public context are too large. Ask a shorter question.');
  // Each project gets an equal share of what is left for descriptions.
  const spare = room - bytes(shell(projects.map((p) => ({ ...p, description: '' }))));
  const share = projects.length ? Math.floor(spare / projects.length) - 8 : 0;
  const fitted = projects.map((p) => ({ ...p, description: cut(p.description, share) }));
  return { projects: fitted, text: shell(fitted) };
}
