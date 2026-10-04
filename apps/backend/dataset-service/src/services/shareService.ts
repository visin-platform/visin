import { appLink, excerpt, NotFoundError, type SharePage } from '@visin/backend-core';
import { Dataset } from '../models/Dataset';
import { LIVE } from './accessService';
import { lookupOwnerIdentities } from '../clients/ownerIdentityClient';

/**
 * What a chat or a feed shows for a link to a public dataset, and where it leads in the app. A dataset that is
 * private, in the trash, being deleted or unknown, and a deployment with no app address, all answer the same.
 * The cover is not used: its address is a short-lived signed one, which would be dead by the time anyone looked.
 */
export async function datasetSharePage(id: string): Promise<SharePage> {
  const url = appLink(`/datasets/${encodeURIComponent(id)}`);
  const dataset = /^[0-9a-fA-F]{24}$/.test(id)
    ? await Dataset.findOne({ _id: id, ...LIVE, visibility: 'public' })
    : null;
  if (!url || !dataset) throw new NotFoundError('Nothing to share here');

  const owner = (await lookupOwnerIdentities([dataset.owner])).get(dataset.owner.id)?.name;
  const size = `${dataset.imageCount.toLocaleString('en-US')} ${dataset.imageCount === 1 ? 'image' : 'images'}`;
  return {
    url,
    title: dataset.name,
    description: [dataset.description?.trim() ? excerpt(dataset.description) : size, owner ? `by ${owner}` : '']
      .filter(Boolean)
      .join(' · '),
    image: appLink('/og-image.jpg')
  };
}

/** Public, live dataset addresses; visibility is checked on every request. */
export async function datasetSitemap(): Promise<string> {
  if (!appLink('/')) throw new NotFoundError('Nothing to share here');
  const datasets = await Dataset.find({ ...LIVE, visibility: 'public' })
    .sort({ updatedAt: -1 })
    .limit(5000)
    .select('updatedAt');
  const rows = datasets.map(
    (dataset) =>
      `  <url><loc>${appLink(`/datasets/${String(dataset._id)}`)!
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</loc><lastmod>${dataset.updatedAt.toISOString()}</lastmod></url>`
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    '</urlset>',
    ''
  ].join('\n');
}
