jest.mock('../../clients/projectServiceClient', () => ({
  projectDatasetOwner: jest.fn(async () => ({ kind: 'user', id: '000000000000000000000001' }))
}));
jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);
jest.mock('../../clients/hubClient', () => ({ fetchDatasetInfo: jest.fn() }));
jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn(async () => new Map()) }));
jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn(), getMyGroups: jest.fn() }));
jest.mock('../../queue/importQueue', () => ({
  enqueueImport: jest.fn(),
  enqueueScan: jest.fn(),
  enqueueDelete: jest.fn(),
  enqueueRemoveGroup: jest.fn(),
  removeQueuedImport: jest.fn()
}));

import mongoose from 'mongoose';
import { enqueueDelete } from '../../queue/importQueue';
import { fetchDatasetInfo } from '../../clients/hubClient';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { Dataset } from '../../models/Dataset';
import { purgeExpiredTrash } from '../../services/datasetService';
import { ADMIN, GROUP, GROUP_OWNER, MEMBER, OTHER_GROUP, OWNER, STRANGER, baseUrl, call, createDataset, events, groupDataset, useDatasetApi } from '../fixtures/datasetApi';

useDatasetApi();

describe('creating a dataset', () => {
  it('makes it private and the creator’s unless told otherwise', async () => {
    const created = (await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x' } })).body.data;
    expect(created).toMatchObject({
      owner: { kind: 'user', id: OWNER },
      createdBy: OWNER,
      visibility: 'private',
      permissions: { own: true }
    });
  });

  it('puts it in a group only for the group’s members, and public there only for its owner', async () => {
    const create = (user: string, body: Record<string, unknown>) =>
      call('/api/datasets', { method: 'POST', user, body: { name: 'x', ...body } });
    const inGroup = { owner: { kind: 'group', id: GROUP } };
    expect((await create(STRANGER, inGroup)).status).toBe(403);
    expect((await create(MEMBER, inGroup)).status).toBe(201);
    expect((await create(ADMIN, { ...inGroup, visibility: 'public' })).status).toBe(403);
    expect((await create(GROUP_OWNER, { ...inGroup, visibility: 'public' })).body.data.visibility).toBe('public');
    expect((await create(MEMBER, { owner: { kind: 'user', id: OWNER } })).status).toBe(403);
  });

  it('validates what it is given', async () => {
    expect((await call('/api/datasets', { method: 'POST', body: { name: 'x' } })).status).toBe(401);
    expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: '' } })).status).toBe(400);
    expect(
      (
        await call('/api/datasets', {
          method: 'POST',
          user: OWNER,
          body: { name: 'x', owner: { kind: 'team', id: GROUP } }
        })
      ).status
    ).toBe(400);
    expect(
      (await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'x', visibility: 'group' } })).status
    ).toBe(400);
  });
});

describe('changing a dataset', () => {
  it('lets a manager rename it, and only its owner change who sees it', async () => {
    const id = await groupDataset();
    const patch = (user: string, body: Record<string, unknown>) =>
      call(`/api/datasets/${id}`, { method: 'PATCH', user, body });
    expect((await patch(MEMBER, { name: 'y' })).status).toBe(403);
    expect((await patch(ADMIN, { name: 'Renamed', description: 'by admin' })).body.data).toMatchObject({
      name: 'Renamed',
      description: 'by admin'
    });
    expect((await patch(ADMIN, { description: '' })).body.data.description).toBeUndefined();
    // The edit form sends the visibility it opened with; unchanged, it needs no more than managing.
    expect((await patch(ADMIN, { name: 'Again', visibility: 'private' })).status).toBe(200);
    expect((await patch(ADMIN, { visibility: 'public' })).status).toBe(403);
    expect((await patch(GROUP_OWNER, { visibility: 'public' })).body.data.visibility).toBe('public');
    expect((await events(1))[0]).toMatchObject({
      action: 'visibility',
      visibility: 'public',
      actorId: GROUP_OWNER,
      groupIds: [GROUP]
    });
  });
});

describe('transferring a dataset', () => {
  it('lets its owner hand it to a group they are in, one way', async () => {
    const id = await createDataset({ name: 'Mine' });
    const transfer = (user: string, owner: Record<string, unknown>) =>
      call(`/api/datasets/${id}/owner`, { method: 'PUT', user, body: { owner } });

    expect((await transfer(OWNER, { kind: 'group', id: GROUP })).status).toBe(403);
    expect((await transfer(STRANGER, { kind: 'group', id: OTHER_GROUP })).status).toBe(403);
    const moved = await transfer(OWNER, { kind: 'group', id: OTHER_GROUP });
    expect(moved.body.data).toMatchObject({
      owner: { kind: 'group', id: OTHER_GROUP, name: 'Other team' },
      permissions: { own: false }
    });
    expect((await events(1))[0]).toMatchObject({
      action: 'transfer',
      from: { kind: 'user', id: OWNER },
      to: { kind: 'group', id: OTHER_GROUP },
      groupIds: [OTHER_GROUP],
      resourceName: 'Mine'
    });
    // A member of the group now; taking it back is for the group's owner.
    expect((await transfer(OWNER, { kind: 'user', id: OWNER })).status).toBe(403);
    expect((await transfer(OWNER, { kind: 'group', id: 'not-an-id' })).status).toBe(400);
  });

  it("lets the owning group's owner hand it to a member, or to another group they are in", async () => {
    const id = await groupDataset();
    const transfer = (user: string, owner: Record<string, unknown>) =>
      call(`/api/datasets/${id}/owner`, { method: 'PUT', user, body: { owner } });
    expect((await transfer(ADMIN, { kind: 'user', id: ADMIN })).status).toBe(403);
    expect((await transfer(GROUP_OWNER, { kind: 'user', id: STRANGER })).status).toBe(403);
    expect((await transfer(GROUP_OWNER, { kind: 'group', id: OTHER_GROUP })).body.data.owner).toMatchObject({
      kind: 'group',
      id: OTHER_GROUP
    });
  });
});

describe('the trash', () => {
  it('hides a trashed dataset at once, and lets its owner restore it or delete it for good', async () => {
    const id = await groupDataset();
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(200);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(404);
    expect((await call(`/api/datasets/${id}`, { user: ADMIN })).status).toBe(404);
    expect((await call('/api/datasets', { user: ADMIN })).body.data.datasets).toEqual([]);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).status).toBe(404);

    expect((await call('/api/datasets/trash')).status).toBe(401);
    expect((await call('/api/datasets/trash', { user: MEMBER })).body.data).toEqual([]);
    expect(
      (await call('/api/datasets/trash', { user: ADMIN })).body.data.map((row: { _id: string }) => row._id)
    ).toEqual([id]);
    expect((await call(`/api/datasets/${id}/restore`, { method: 'POST', user: ADMIN })).status).toBe(403);
    expect((await call(`/api/datasets/not-an-id/restore`, { method: 'POST', user: ADMIN })).status).toBe(404);
    const restored = await call(`/api/datasets/${id}/restore`, { method: 'POST', user: GROUP_OWNER });
    expect(restored.body.data.trashedAt).toBeUndefined();
    expect((await call(`/api/datasets/${id}`, { user: MEMBER })).status).toBe(200);

    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: GROUP_OWNER })).status).toBe(404);
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: GROUP_OWNER });
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: ADMIN })).status).toBe(403);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: GROUP_OWNER })).status).toBe(202);
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: id });
    expect((await events(4)).map((row) => row.action)).toEqual(['trash', 'restore', 'trash', 'purge']);
  });

  it('deletes what has been in the trash for 30 days, except what labeling still uses', async () => {
    const old = await createDataset({ name: 'old' });
    const held = await createDataset({ name: 'held' });
    const recent = await createDataset({ name: 'recent' });
    const monthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Dataset.updateMany({ _id: { $in: [old, held] } }, { $set: { trashedAt: monthAgo } });
    await Dataset.updateOne({ _id: recent }, { $set: { trashedAt: new Date() } });
    await Dataset.updateOne(
      { _id: held },
      { $push: { holds: { service: 'label-service', ref: 'j1', createdAt: new Date() } } }
    );

    expect(await purgeExpiredTrash()).toBe(1);
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: old });
    expect((await Dataset.findById(old).lean())?.deletingAt).toBeInstanceOf(Date);
    expect((await Dataset.findById(held).lean())?.deletingAt).toBeUndefined();
    expect(await purgeExpiredTrash()).toBe(0);
  });
});

describe('the licence a dataset declares', () => {
  const patch = (id: string, body: Record<string, unknown>, user = OWNER) =>
    call(`/api/datasets/${id}`, { method: 'PATCH', user, body });

  it('is unstated until the publisher says, and is never guessed from the Hub', async () => {
    const id = await createDataset({
      name: 'Hub set',
      visibility: 'public',
      source: { provider: 'hf', repo: 'acme/zod-png', revision: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' }
    });
    const dataset = (await call(`/api/datasets/${id}`)).body.data;
    expect(dataset.license).toBeUndefined();
    expect(dataset.credit).toBeUndefined();
    expect(fetchDatasetInfo).not.toHaveBeenCalled();
  });

  it('is declared with a listed id, whose name, link and commercial use come from the table', async () => {
    const id = await createDataset({
      name: 'Licensed',
      visibility: 'public',
      license: { id: 'cc-by-nc-4.0' },
      credit: '  Krizhevsky, 2009  '
    });
    const dataset = (await call(`/api/datasets/${id}`)).body.data;
    expect(dataset.license).toEqual({
      id: 'cc-by-nc-4.0',
      name: 'CC BY-NC 4.0',
      url: 'https://creativecommons.org/licenses/by-nc/4.0/',
      commercial: false
    });
    expect(dataset.credit).toBe('Krizhevsky, 2009');
    // Stored as the id alone, so a corrected table corrects every dataset.
    expect((await Dataset.findById(id).lean())?.license).toEqual({ id: 'cc-by-nc-4.0' });
  });

  it('takes a licence that is not listed by the name the publisher gives it', async () => {
    const id = await createDataset();
    const response = await patch(id, { license: { id: 'other', name: 'Acme research terms', url: 'https://acme.test/terms' } });
    expect(response.body.data.license).toEqual({ id: 'other', name: 'Acme research terms', url: 'https://acme.test/terms' });
    expect(response.body.data.license).not.toHaveProperty('commercial');
  });

  it('changes with manage, and is taken back with null', async () => {
    const id = await groupDataset();
    expect((await patch(id, { license: { id: 'mit' } }, MEMBER)).status).toBe(403);
    expect((await patch(id, { license: { id: 'mit' }, credit: 'Ann' }, ADMIN)).body.data).toMatchObject({
      license: { id: 'mit', name: 'MIT' },
      credit: 'Ann'
    });
    // Saving the form without touching the licence leaves it as it is.
    expect((await patch(id, { name: 'Renamed' }, ADMIN)).body.data.license.id).toBe('mit');
    const cleared = (await patch(id, { license: null, credit: '' }, ADMIN)).body.data;
    expect(cleared.license).toBeUndefined();
    expect(cleared.credit).toBeUndefined();
  });

  it('refuses an id that is not listed, an unnamed other, extra fields and a link that is not http(s)', async () => {
    const id = await createDataset();
    for (const license of [
      { id: 'wtfpl-ish' },
      { id: 'other' },
      { id: 'other', name: '  ' },
      { id: 'other', name: 'X', url: 'not a link' },
      { id: 'other', name: 'X', url: 'javascript:alert(1)' },
      { id: 'other', name: 'X', url: 'https://user:pw@acme.test/terms' },
      { id: 'mit', name: 'Not MIT really' }
    ]) {
      expect((await patch(id, { license })).status).toBe(400);
      expect((await call('/api/datasets', { method: 'POST', user: OWNER, body: { name: 'Bad', license } })).status).toBe(400);
    }
  });

  it('lists the choices to anyone, ending with other', async () => {
    const response = await call('/api/datasets/licenses');
    expect(response.status).toBe(200);
    const ids = response.body.data.map((choice: { id: string }) => choice.id);
    expect(ids).toContain('cc-by-4.0');
    expect(ids[ids.length - 1]).toBe('other');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the public activity feed', () => {
  const feed = async (query: string, user?: string) =>
    (await call(`/api/datasets/activity?${query}`, { user })).body.data as {
      kind: string;
      at: string;
      dataset: { id: string; name: string; imageCount: number };
    }[];
  const names = async (query: string, user?: string) => (await feed(query, user)).map((item) => item.dataset.name);
  const madeOn = (id: string, day: string) =>
    Dataset.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { createdAt: new Date(`${day}T12:00:00.000Z`) } }
    );

  it("lists the public datasets a person made, newest first, and nothing of anyone else's", async () => {
    await madeOn(await createDataset({ name: 'Old', visibility: 'public' }, OWNER), '2026-09-01');
    await madeOn(await createDataset({ name: 'New', visibility: 'public' }, OWNER), '2026-09-05');
    await createDataset({ name: 'Mine only' }, OWNER);
    await createDataset({ name: 'Theirs', visibility: 'public' }, MEMBER);

    const items = await feed(`user=${OWNER}`);

    expect(items.map((item) => item.dataset.name)).toEqual(['New', 'Old']);
    expect(items[0]).toEqual({
      kind: 'dataset.created',
      at: '2026-09-05T12:00:00.000Z',
      dataset: { id: expect.any(String), name: 'New', imageCount: 0 }
    });
    expect(JSON.stringify(items)).not.toMatch(new RegExp(`${OWNER}|${MEMBER}`));
  });

  it('reads the same to its owner as to a stranger, since only public datasets count', async () => {
    await createDataset({ name: 'Public', visibility: 'public' }, OWNER);
    await createDataset({ name: 'Private' }, OWNER);

    expect(await names(`user=${OWNER}`)).toEqual(['Public']);
    expect(await names(`user=${OWNER}`, OWNER)).toEqual(['Public']);
    expect(await names(`user=${OWNER}`, STRANGER)).toEqual(['Public']);
  });

  it('drops a dataset the moment it is made private or trashed', async () => {
    const id = await createDataset({ name: 'Going', visibility: 'public' }, OWNER);
    expect(await names(`user=${OWNER}`)).toEqual(['Going']);

    expect(
      (await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { visibility: 'private' } })).status
    ).toBe(200);
    expect(await names(`user=${OWNER}`)).toEqual([]);

    await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { visibility: 'public' } });
    expect(await names(`user=${OWNER}`)).toEqual(['Going']);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER })).status).toBeLessThan(300);
    expect(await names(`user=${OWNER}`)).toEqual([]);
  });

  it("lists a group's public datasets, whoever in the group made them", async () => {
    await createDataset(
      { name: 'Team public', owner: { kind: 'group', id: GROUP }, visibility: 'public' },
      GROUP_OWNER
    );
    await groupDataset('Team private', MEMBER);
    await createDataset({ name: 'Personal', visibility: 'public' }, GROUP_OWNER);

    expect(await names(`owner=${GROUP}`)).toEqual(['Team public']);
  });

  it('is limited, and wants exactly one of a person or a group, as ids', async () => {
    await createDataset({ name: 'One', visibility: 'public' }, OWNER);
    await createDataset({ name: 'Two', visibility: 'public' }, OWNER);

    expect(await feed(`user=${OWNER}&limit=1`)).toHaveLength(1);
    for (const query of [
      '',
      `user=${OWNER}&owner=${GROUP}`,
      'user=ann',
      `user=${OWNER}&limit=0`,
      `user=${OWNER}&limit=101`
    ]) {
      expect((await call(`/api/datasets/activity?${query}`)).status).toBe(400);
    }
  });
});

describe('the preview page', () => {
  const savedApp = process.env.SHELL_FRONT_URL;
  const share = async (id: string) => {
    const response = await fetch(`${baseUrl}/api/datasets/share/${id}`);
    return { status: response.status, headers: response.headers, text: await response.text() };
  };

  beforeEach(() => {
    process.env.SHELL_FRONT_URL = 'https://app.example.test';
    jest.mocked(lookupOwnerIdentities).mockReset();
    jest
      .mocked(lookupOwnerIdentities)
      .mockImplementation(
        async (owners) =>
          new Map(
            owners.filter((owner) => owner.id === OWNER).map((owner) => [owner.id, { id: owner.id, name: 'Ann Lee' }])
          )
      );
  });
  afterAll(() => {
    if (savedApp === undefined) delete process.env.SHELL_FRONT_URL;
    else process.env.SHELL_FRONT_URL = savedApp;
  });

  it('tells an unfurler what a public dataset is, who made it, and where it lives in the app', async () => {
    const id = await createDataset(
      { name: 'Harbour frames', description: 'Frames from the harbour cameras', visibility: 'public' },
      OWNER
    );

    const { status, text, headers } = await share(id);

    expect(status).toBe(200);
    expect(text).toContain('<meta property="og:title" content="Harbour frames">');
    expect(text).toContain('<meta property="og:description" content="Frames from the harbour cameras · by Ann Lee">');
    expect(text).toContain(`<meta property="og:url" content="https://app.example.test/datasets/${id}">`);
    expect(text).toContain('content="https://app.example.test/og-image.jpg"');
    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('content-security-policy')).toBe("default-src 'none'");
  });

  it('says how many images there are when it has no description, and names no owner who is not shown', async () => {
    const id = await createDataset({ name: 'Bare set', visibility: 'public' }, MEMBER);
    await Dataset.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { imageCount: 4110 } });

    expect((await share(id)).text).toContain('content="4,110 images"');
    await Dataset.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { imageCount: 1 } });
    expect((await share(id)).text).toContain('content="1 image"');
  });

  it('answers the same for a private dataset, one in the trash and one that is not there', async () => {
    const privateId = await createDataset({ name: 'Mine only' }, OWNER);
    const trashed = await createDataset({ name: 'Going', visibility: 'public' }, OWNER);
    await call(`/api/datasets/${trashed}`, { method: 'DELETE', user: OWNER });

    const answers = await Promise.all([share(privateId), share(trashed), share('0'.repeat(24)), share('not-an-id')]);

    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((answer) => answer.text)).size).toBe(1);
  });

  it('is not there where the deployment has no address for the app', async () => {
    const id = await createDataset({ name: 'Harbour frames', visibility: 'public' }, OWNER);
    delete process.env.SHELL_FRONT_URL;

    expect((await share(id)).status).toBe(404);
  });

  it('lists only public live datasets, and removes them as soon as visibility changes', async () => {
    const visible = await createDataset({ name: 'Public set', visibility: 'public' }, OWNER);
    const privateId = await createDataset({ name: 'Private set' }, OWNER);
    const trashed = await createDataset({ name: 'Trashed set', visibility: 'public' }, OWNER);
    await call(`/api/datasets/${trashed}`, { method: 'DELETE', user: OWNER });
    const sitemap = () => fetch(`${baseUrl}/api/datasets/sitemap.xml`);
    const response = await sitemap();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(text).toContain(`/datasets/${visible}</loc>`);
    expect(text).not.toContain(privateId);
    expect(text).not.toContain(trashed);
    await Dataset.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(visible) },
      { $set: { visibility: 'private' } }
    );
    expect(await (await sitemap()).text()).not.toContain(visible);
    expect((await share(visible)).status).toBe(404);
    delete process.env.SHELL_FRONT_URL;
    expect((await sitemap()).status).toBe(404);
  });

  it('escapes what a dataset calls itself', async () => {
    const id = await createDataset(
      { name: '"><script>alert(1)</script>', description: '<img src=x onerror=alert(1)>', visibility: 'public' },
      OWNER
    );

    const { text } = await share(id);

    expect(text).not.toContain('<script>');
    expect(text).not.toContain('<img');
  });
});
