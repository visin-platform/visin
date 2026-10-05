import { Request, Response } from 'express';
import { appLink, escapeHtml, excerpt, NotFoundError, sendSharePage } from '@visin/backend-core';
import {
  getPublicGroup,
  listPublicGroupHandles,
  listPublicGroups,
  lookupPublicGroups,
  searchPublicGroups
} from '../services/groupService';

/** A group's public page, for anyone. */
export const getPublic = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getPublicGroup(req.params.handle as string) });
};

/** Names and handles for the owners of what other services list. Groups without a public page are left out. */
export const lookupPublic = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids: string[] };
  res.json({ success: true, data: await lookupPublicGroups(ids) });
};

/** Groups with a public page, found by the start of their handle or name. */
export const searchPublic = async (req: Request, res: Response): Promise<void> => {
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  res.json({ success: true, data: await searchPublicGroups(q, limit) });
};

/**
 * The page a link to a group's public page unfurls from, which sends people on to the app. A group whose page is off,
 * that was deleted or never existed, and a deployment with no app address, all answer the same: nothing to share.
 */
export const getShare = async (req: Request, res: Response): Promise<void> => {
  const handle = req.params.handle as string;
  const url = appLink(`/g/${encodeURIComponent(handle)}`);
  if (!url) throw new NotFoundError('Nothing to share here');
  const group = await getPublicGroup(handle).catch((error: unknown) => {
    if (error instanceof NotFoundError) throw new NotFoundError('Nothing to share here');
    throw error;
  });
  sendSharePage(res, {
    url,
    title: group.name,
    description: group.description ? excerpt(group.description) : 'A group on Visin',
    image: appLink('/og-image.jpg')
  });
};

/** Every group with a public page, a page at a time: the app's directory of groups. */
export const listPublic = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  res.set('Cache-Control', 'no-store').json({ success: true, data: await listPublicGroups(page, limit) });
};

const SITEMAP_LIMIT = 5000;

/**
 * The addresses of public group pages, for the sitemap the app's robots.txt points search engines at. Checked on every
 * request and never kept, so a page that is turned off is gone from it at once. 404 where there is no app address.
 */
export const getSitemap = async (_req: Request, res: Response): Promise<void> => {
  if (!appLink('/')) throw new NotFoundError('Nothing to share here');
  const handles = await listPublicGroupHandles(SITEMAP_LIMIT);
  const addresses = [
    appLink('/people/groups')!,
    ...handles.map((handle) => appLink(`/g/${encodeURIComponent(handle)}`)!)
  ];
  const rows = addresses.map((address) => `  <url><loc>${escapeHtml(address)}</loc></url>`);
  res
    .status(200)
    .set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' })
    .send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...rows,
        '</urlset>',
        ''
      ].join('\n')
    );
};
