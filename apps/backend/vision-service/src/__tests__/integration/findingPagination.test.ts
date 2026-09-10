import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Finding from '../../models/Finding';
import Project from '../../models/Project';
import { listFindings } from '../../services/findingService';
import { listFindingsQuerySchema } from '../../validation/findingSchemas';

describe('visible finding pages with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer | undefined;
  let mine: string;
  let hidden: string;
  let publicProject: string;
  const owner = 'reader';
  const timestamp = new Date('2026-09-01T00:00:00.000Z');
  const rows = (projectId: string, count: number, createdAt = timestamp) =>
    Array.from({ length: count }, (_, i) => ({
      projectId, title: `Finding ${i}`, body: 'Evidence', trainingIds: [],
      authorKind: 'person', authorLabel: 'Author', authorUserId: owner, createdAt,
    }));

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([Finding.init(), Project.init()]);
  }, 120_000);

  beforeEach(async () => {
    const projects = await Project.create([
      { name: 'Mine', slug: 'mine', ownerId: owner },
      { name: 'Private', slug: 'private', ownerId: 'someone-else' },
      { name: 'Public', slug: 'public', ownerId: 'someone-else', isPublic: true },
    ]);
    [mine, hidden, publicProject] = projects.map(project => project._id.toString());
  });

  afterEach(async () => {
    await Promise.all([Finding.deleteMany({}), Project.deleteMany({})]);
  });

  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  it('fills a visible page despite more than two pages of newer private findings', async () => {
    await Finding.insertMany([
      ...rows(mine, 53), ...rows(publicProject, 2),
      ...rows(hidden, 101, new Date('2026-09-02T00:00:00.000Z')),
    ]);
    const page = await listFindings(owner, {});
    expect(page).toHaveLength(50);
    expect(page.every(finding => [mine, publicProject].includes(String(finding.projectId)))).toBe(true);
  });

  const cursorFor = (row: Record<string, unknown>) => `${(row.createdAt as Date).toISOString()}_${row._id}`;

  it('pages all visible rows exactly once with timestamp ties and a deleted cursor row', async () => {
    await Finding.insertMany([
      ...rows(mine, 53), ...rows(publicProject, 8),
      ...rows(mine, 2, new Date('2026-08-31T00:00:00.000Z')),
      ...rows(hidden, 101, new Date('2026-09-02T00:00:00.000Z')),
    ]);
    const expected = await Finding.find({ projectId: { $in: [mine, publicProject] } }).sort({ createdAt: -1, _id: -1 });
    const first = await listFindings(owner, { limit: 20 });
    expect(first).toHaveLength(20);
    const cursor = cursorFor(first[19]);
    await Finding.deleteOne({ _id: String(first[19]._id) });
    // Newly inserted rows before the cursor belong to a refresh, not page two.
    await Finding.insertMany(rows(mine, 1, new Date('2026-09-03T00:00:00.000Z')));
    const second = await listFindings(owner, { limit: 20, before: cursor });
    const third = await listFindings(owner, { limit: 20, before: cursorFor(second[19]) });
    const fourth = await listFindings(owner, { limit: 20, before: cursorFor(third[19]) });
    expect([second.length, third.length, fourth.length]).toEqual([20, 20, 3]);
    expect([...first, ...second, ...third, ...fourth].map(row => String(row._id)))
      .toEqual(expected.map(row => row._id.toString()));
    expect(await listFindings(owner, { before: cursorFor(fourth[2]) })).toEqual([]);
  });

  it('combines project slugs, subject-or-citation matching, cursor and soft deletion', async () => {
    const docs = await Finding.insertMany(rows(mine, 8).map((row, i) => ({
      ...row, ...(i % 2 ? { trainingId: 'subject' } : {}),
      // Use a valid but absent training ID so citation hydration remains real.
      trainingIds: i % 2 ? [] : ['507f1f77bcf86cd799439011'],
    })));
    await Finding.updateOne({ _id: docs[7]._id }, { $set: { deletedAt: new Date() } });
    const first = await listFindings(owner, { project: 'mine', training: 'subject', limit: 2 });
    const next = await listFindings(owner, { project: mine, training: 'subject', limit: 2, before: cursorFor(first[1]) });
    expect([...first, ...next].map(row => String(row._id))).toEqual([docs[5], docs[3], docs[1]].map(row => row._id.toString()));
    const cited = await listFindings(owner, { training: '507f1f77bcf86cd799439011', limit: 2 });
    expect(cited.map(row => String(row._id))).toEqual([docs[6], docs[4]].map(row => row._id.toString()));
    const citedNext = await listFindings(owner, { training: '507f1f77bcf86cd799439011', before: cursorFor(cited[1]) });
    expect(citedNext.map(row => String(row._id))).toEqual([docs[2], docs[0]].map(row => row._id.toString()));
  });

  it('reapplies visibility for anonymous users, other owners, and permission changes between pages', async () => {
    await Finding.insertMany([...rows(mine, 3), ...rows(hidden, 3), ...rows(publicProject, 3)]);
    const publicPage = await listFindings(undefined, { limit: 2 });
    expect(publicPage.every(row => row.projectId === publicProject)).toBe(true);
    await expect(listFindings('no-projects', { project: 'mine' })).rejects.toMatchObject({ statusCode: 403 });
    const otherPage = await listFindings('someone-else', {});
    expect(otherPage).toHaveLength(6);
    expect(otherPage.every(row => row.projectId !== mine)).toBe(true);
    await Project.updateOne({ _id: publicProject }, { $set: { isPublic: false } });
    expect(await listFindings(undefined, { before: cursorFor(publicPage[1]) })).toEqual([]);
    expect(await listFindings('no-projects', {})).toEqual([]);
  });

  it.each([
    '', 'not-a-cursor', '2026-02-30T00:00:00.000Z_507f1f77bcf86cd799439011',
    '2026-99-01T00:00:00.000Z_507f1f77bcf86cd799439011',
    '2026-09-01T00:00:00.000Z_zzzzzzzzzzzzzzzzzzzzzzzz',
  ])('rejects malformed cursor %j as a client error', async before => {
    await expect(listFindings(owner, { before })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('validates bounded query parameters', () => {
    expect(listFindingsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listFindingsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(listFindingsQuerySchema.safeParse({ before: ['bad'] }).success).toBe(false);
    expect(listFindingsQuerySchema.parse({ limit: '20' })).toEqual({ limit: 20 });
  });
});
