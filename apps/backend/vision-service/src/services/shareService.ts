import { appLink, excerpt, NotFoundError, type SharePage } from '@visin/backend-core';
import Project from '../models/Project';
import Suite from '../models/Suite';
import { lookupOwnerIdentities } from '../clients/ownerIdentityClient';

/** What is shown of a project that has no description of its own: its readme, less the marks that make it Markdown. */
const plain = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    // Exclude another opener so unclosed markers cannot repeatedly scan the rest of the readme.
    .replace(/!?\[([^[\]\n]*)\]\([^()[\]\n]*\)/g, '$1')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_`~|]/g, '');

const NOT_THERE = 'Nothing to share here';
const isProjectId = (identifier: string): boolean => /^[0-9a-fA-F]{24}$/.test(identifier);

// The app treats id-shaped references as ids only, including old records with ambiguous slugs.
const projectPath = (project: { slug?: string; _id: unknown }): string =>
  `/projects/${encodeURIComponent(project.slug && !isProjectId(project.slug) ? project.slug : String(project._id))}`;

/**
 * What a chat or a feed shows for a link to a public project, and where it leads in the app. A project that is
 * private, in the trash or unknown, and a deployment with no app address, all answer the same: nothing to share.
 */
export async function projectSharePage(identifier: string): Promise<SharePage> {
  const url = appLink(`/projects/${encodeURIComponent(identifier)}`);
  if (!url) throw new NotFoundError(NOT_THERE);
  const reference = isProjectId(identifier) ? { _id: identifier } : { slug: identifier.toLowerCase() };
  const project = await Project.findOne({ ...reference, visibility: 'public', trashedAt: null });
  if (!project) throw new NotFoundError(NOT_THERE);

  const owner = (await lookupOwnerIdentities([project.owner])).get(project.owner.id)?.name;
  const summary = project.description?.trim() || excerpt(plain(project.readme ?? ''));
  const by = owner ? `by ${owner}` : '';
  return {
    // The address people were sent is the one the project answers to best: its slug where it has one.
    url: appLink(projectPath(project))!,
    title: project.name,
    description: [excerpt(summary), by].filter(Boolean).join(summary && by ? ' · ' : '') || 'A project on Visin',
    image: appLink('/og-image.jpg')
  };
}

const SITEMAP_LIMIT = 5000;

/**
 * Public project and leaderboard addresses in the app, most recently edited first, for the sitemap the app's robots.txt
 * points at. Capped well under the protocol's 50,000. Names are not in it, only addresses.
 */
export async function projectSitemap(): Promise<string> {
  const front = appLink('/');
  if (!front) throw new NotFoundError(NOT_THERE);
  const projects = await Project.find({ visibility: 'public', trashedAt: null })
    .sort({ updatedAt: -1 })
    .limit(SITEMAP_LIMIT)
    .select('slug updatedAt lastActivityAt');
  const suites = await Suite.find({ visibility: 'public' })
    .sort({ updatedAt: -1 })
    .limit(SITEMAP_LIMIT)
    .select('slug version projectId updatedAt');
  const liveIds = new Set(
    (
      await Project.find({
        _id: { $in: suites.map((suite) => suite.projectId) },
        visibility: 'public',
        trashedAt: null
      }).select('_id')
    ).map((project) => String(project._id))
  );
  const boards = suites
    .filter((suite) => liveIds.has(suite.projectId))
    .map(
      (suite) =>
        `  <url><loc>${xml(appLink(`/leaderboards/${encodeURIComponent(suite.slug)}/${suite.version}`)!)}</loc><lastmod>${suite.updatedAt.toISOString()}</lastmod></url>`
    );
  const rows = projects.map((project) => {
    const at = project.lastActivityAt ?? project.updatedAt;
    return `  <url><loc>${xml(appLink(projectPath(project))!)}</loc><lastmod>${at.toISOString()}</lastmod></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${xml(front)}</loc></url>`,
    ...rows,
    ...boards,
    '</urlset>',
    ''
  ].join('\n');
}

const xml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** A leaderboard preview uses the same public gates as its page, including its project's visibility. */
export async function leaderboardSharePage(slug: string, version: number): Promise<SharePage> {
  const url = appLink(`/leaderboards/${encodeURIComponent(slug)}/${version}`);
  if (!url) throw new NotFoundError(NOT_THERE);
  const suite = await Suite.findOne({ slug, version, visibility: 'public' });
  if (!suite || !(await Project.exists({ _id: suite.projectId, visibility: 'public', trashedAt: null })))
    throw new NotFoundError(NOT_THERE);
  return {
    url,
    title: `${suite.name} · v${version}`,
    description: excerpt(suite.description || 'A leaderboard on Visin'),
    image: appLink('/og-image.jpg')
  };
}
