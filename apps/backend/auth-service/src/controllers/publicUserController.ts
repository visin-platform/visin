import { Request, Response } from 'express';
import { appLink, escapeHtml, excerpt, NotFoundError, sendSharePage } from '@visin/backend-core';
import { User, type IUser } from '../models/User';
import { ensureHandle } from '../services/handleService';
import { escapeRegex } from '../utils/escapeRegex';

const PUBLIC_FIELDS = 'handle firstName lastName picture bio links profilePublic showActivity createdAt';

/**
 * What the world may know of an account: never the email, and a name only as
 * the person gave it (the handle where they gave none), so there is nothing here
 * to fall back to that was not chosen to be shown.
 */
export const toPublicUser = (user: IUser) => ({
  id: user._id.toString(),
  handle: user.handle as string,
  name: [user.firstName, user.lastName].filter(Boolean).join(' ') || (user.handle as string),
  ...(user.picture ? { picture: user.picture } : {}),
  ...(user.bio ? { bio: user.bio } : {}),
  links: user.links ?? [],
  /** Whether the page may list what they have been doing. */
  showActivity: user.showActivity !== false,
  createdAt: user.createdAt.toISOString()
});

/**
 * An account's public page, for anyone. An account that hid its profile reads as not
 * found, the same as one that never existed, so the answer does not say which.
 */
export const getPublicUser = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findOne({ handle: req.params.handle }).select(PUBLIC_FIELDS);
  if (!user || user.profilePublic === false) {
    throw new NotFoundError('No such user');
  }
  res.json({ success: true, data: toPublicUser(user) });
};

/**
 * Names and avatars for the owners of what other services list, in one call. An owner
 * with a hidden profile comes back as a bare id: the service shows that something is
 * owned, and by whom only as far as the owner agreed. Unknown ids are left out.
 */
export const lookupPublicUsers = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids: string[] };
  const users = await User.find({ _id: { $in: ids } }).select(PUBLIC_FIELDS);
  const data = await Promise.all(
    users.map(async (user) => {
      if (user.profilePublic === false) return { id: user._id.toString() };
      // Reading is what gives a pre-handle account its handle, so its page can be linked.
      await ensureHandle(user);
      const { id, handle, name, picture } = toPublicUser(user);
      return { id, handle, name, ...(picture ? { picture } : {}) };
    })
  );
  res.json({ success: true, data });
};

/**
 * People by the start of their handle or of either part of their name, for the app's search. Only accounts with a
 * public page are found, and only what a listing needs of them: never the email, a bio or links. Handles are stored
 * in lowercase, so that half of the match can use the handle index.
 */
export const searchPublicUsers = async (req: Request, res: Response): Promise<void> => {
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  const text = new RegExp(`^${escapeRegex(q)}`, 'i');
  const users = await User.find({
    profilePublic: { $ne: false },
    handle: { $type: 'string' },
    $or: [{ handle: new RegExp(`^${escapeRegex(q.toLowerCase())}`) }, { firstName: text }, { lastName: text }]
  })
    .select(PUBLIC_FIELDS)
    .sort({ handle: 1 })
    .limit(limit);
  res.json({
    success: true,
    data: users.map((user) => {
      const { id, handle, name, picture } = toPublicUser(user);
      return { id, handle, name, ...(picture ? { picture } : {}) };
    })
  });
};

/**
 * The page a link to someone's public page unfurls from, which sends people on to the app. Someone who hid their page,
 * who does not exist, and a deployment with no app address, all answer the same: nothing to share.
 */
export const getUserShare = async (req: Request, res: Response): Promise<void> => {
  const handle = String(req.params.handle);
  const user = await User.findOne({ handle }).select(PUBLIC_FIELDS);
  const url = appLink(`/u/${encodeURIComponent(handle)}`);
  if (!url || !user || user.profilePublic === false) {
    throw new NotFoundError('Nothing to share here');
  }
  const { name, bio, picture } = toPublicUser(user);
  sendSharePage(res, {
    url,
    title: name,
    description: bio ? excerpt(bio) : `@${handle} on Visin`,
    image: picture && /^https?:\/\//i.test(picture) ? picture : appLink('/og-image.jpg')
  });
};

/** Accounts with a handle and a public page: the ones a visitor can be sent to. */
const LISTED = { profilePublic: { $ne: false }, handle: { $type: 'string' } } as const;

/**
 * Everyone with a public page, a page at a time in handle order, for the app's People directory: what a search engine
 * follows from the app to each page. Only what a listing needs (never the email, a bio or links), and checked on
 * every request, so someone who hides their page is gone from it at once.
 */
export const listPublicUsers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const [users, total] = await Promise.all([
    User.find(LISTED)
      .select(PUBLIC_FIELDS)
      .sort({ handle: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(LISTED)
  ]);
  res.set('Cache-Control', 'no-store').json({
    success: true,
    data: {
      people: users.map((user) => {
        const { id, handle, name, picture } = toPublicUser(user);
        return { id, handle, name, ...(picture ? { picture } : {}) };
      }),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    }
  });
};

const SITEMAP_LIMIT = 5000;

/**
 * The addresses of public profiles and of the People directory, for the sitemap the app's robots.txt points search engines at. Only accounts that
 * have a handle and a public page are listed, and only their address: no name, and no date, because an account's
 * `updatedAt` moves with every sign-in and says nothing about the page. Checked on every request and never kept, so a
 * page that is turned off is gone from it at once. 404 where the deployment has no app address.
 */
export const getSitemap = async (_req: Request, res: Response): Promise<void> => {
  if (!appLink('/')) throw new NotFoundError('Nothing to share here');
  const users = await User.find(LISTED).sort({ handle: 1 }).limit(SITEMAP_LIMIT).select('handle');
  const addresses = [
    appLink('/people')!,
    ...users.map((user) => appLink(`/u/${encodeURIComponent(user.handle as string)}`)!)
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
