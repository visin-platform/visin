import { vi } from 'vitest';
import { execFile } from 'child_process';
import { createHmac } from 'crypto';
import { writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { promisify } from 'util';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Project from '../../models/Project';
import RunSample from '../../models/RunSample';
import Suite from '../../models/Suite';
import SuiteSlug from '../../models/SuiteSlug';
import Evaluation from '../../models/Evaluation';
import JudgePair from '../../models/JudgePair';
import projectRoutes from '../../routes/projectRoutes';
import suiteRoutes from '../../routes/suiteRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import evaluationRoutes from '../../routes/evaluationRoutes';

vi.mock('../../clients/projectGroupsClient', async () => {
  const module = { getUserGroups: vi.fn(async () => []) };
  return { default: module, ...module };
});
vi.mock('@visin/backend-core', async () => ({
  ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
  createGroupServiceClient: () => ({ checkMembership: vi.fn(), getMyGroups: vi.fn(async () => []) })
}));

const prepared = process.env.VISIN_MIGRATION_PREPARED;
const pipeline = process.env.VISIN_MIGRATION_PIPELINE;
const pythonPath = process.env.VISIN_MIGRATION_PYTHONPATH;

// This opt-in test consumes the separately prepared private research artifacts.
describe.skipIf(!prepared || !pipeline || !pythonPath)('isolated full VLM migration', () => {
  it('imports the reference and models into a temporary private project', async () => {
    const secret = 'local-migration-test-only';
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    let mongo: MongoMemoryServer | undefined;
    let server: Server | undefined;
    try {
      mongo = await MongoMemoryServer.create();
      await mongoose.connect(mongo.getUri());
      await Promise.all([RunSample.init(), Suite.init(), SuiteSlug.init(), Evaluation.init(), JudgePair.init()]);
      const owner = new mongoose.Types.ObjectId('000000000000000000000001');
      await mongoose.connection.collection('users').insertOne({ _id: owner, email: 'local@example.invalid', tokenVersion: 1 });
      await mongoose.connection.collection('user_sessions').insertOne({ _id: owner, userId: owner, expiresAt: new Date(Date.now() + 3_600_000) });
      const project = await Project.create({ name: 'Private migration test', slug: 'private-migration-test', owner: { kind: 'user', id: String(owner) }, createdBy: String(owner), visibility: 'private' });
      const app = express();
      app.use(express.json({ limit: '16mb' }), identityContextMiddleware);
      app.use('/api/projects', projectRoutes);
      app.use('/api/suites', suiteRoutes);
      app.use('/api/trainings', trainingRoutes);
      app.use('/api/evaluations', evaluationRoutes);
      app.use(errorHandler);
      server = createServer(app);
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const unsigned = [{ alg: 'HS256', typ: 'JWT' }, {
        id: String(owner), email: 'local@example.invalid', tokenVersion: 1, sid: String(owner), typ: 'session',
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600
      }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
      const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
      const script = `
import json, os
from pathlib import Path
from release.publish_to_visin import TAGS, local_client, upload_local
client = local_client(os.environ['TEST_URL'], os.environ['TEST_TOKEN'])
try:
    checkpoints = {tag: {'kind':'local','sha256':str(i)*64,'label':'synthetic local test '+tag} for i, tag in enumerate(TAGS, 1)}
    print(json.dumps(upload_local(client, Path(os.environ['TEST_DATA']), os.environ['TEST_PROJECT'], checkpoints, 'local-migration')))
finally:
    client.close()
`;
      const result = await promisify(execFile)('python3', ['-c', script], {
        cwd: pipeline, timeout: 900_000, maxBuffer: 10_000_000,
        env: { ...process.env, PYTHONPATH: pythonPath, TEST_URL: url, TEST_TOKEN: token, TEST_DATA: prepared, TEST_PROJECT: String(project._id) }
      });
      const output = JSON.parse(result.stdout);
      if (process.env.VISIN_MIGRATION_RESULT) writeFileSync(process.env.VISIN_MIGRATION_RESULT, JSON.stringify(output));
      expect(Object.keys(output.evaluations)).toHaveLength(3);
      const fields = output.comparison.fields as { field: string; groups: { groupBy: string; value?: string; count: number; divergence: number; kappa: number; binaryKappa?: number; matrix: { a: string; b: string; count: number }[]; reference?: { errorRateA: number; errorRateB: number; keepUnlessBothDeleteErrorRate: number; reviewedErrorRate: number } }[] }[];
      const group = (field: string) => fields.find(item => item.field === field)!.groups.find(item => item.groupBy === 'role' && item.value === 'classify')!;
      expect(group('outcome').count).toBe(90_176);
      expect(group('outcome').matrix.filter(cell => cell.a !== cell.b).reduce((sum, cell) => sum + cell.count, 0)).toBe(16_985);
      expect(group('outcome').divergence).toBeCloseTo(0.188, 3);
      expect(group('outcome').kappa).toBeCloseTo(0.41, 2);
      expect(group('verdict').divergence).toBeCloseTo(0.430, 3);
      expect(group('verdict').binaryKappa).toBeCloseTo(0.08, 2);
      expect(group('decision').divergence).toBeCloseTo(0.403, 3);
      const reference = group('outcome').reference!;
      expect(reference.errorRateA).toBeCloseTo(0.229, 3);
      expect(reference.errorRateB).toBeCloseTo(0.217, 3);
      expect(reference.keepUnlessBothDeleteErrorRate).toBeCloseTo(0.204, 3);
      expect(reference.reviewedErrorRate).toBeCloseTo(0.130, 3);
      const left = output.evaluationResults.llava_34b;
      const right = output.evaluationResults['qwen2.5vl_72b_v2'];
      expect(left.validation.state).toBe('eligible');
      expect(right.validation.state).toBe('eligible');
      expect(left.results.overall.overall.false_accept).toBeCloseTo(0.440, 3);
      expect(left.results.overall.overall.false_reject).toBeCloseTo(0.324, 3);
      expect(right.results.overall.overall.false_accept).toBeCloseTo(0.512, 3);
      expect(right.results.overall.overall.false_reject).toBeCloseTo(0.241, 3);
      for (const [name, a, b] of [['vehicle', 0.071, 0.182], ['sign', 0.267, 0.114], ['cyclist', 0.473, 0.341], ['pedestrian', 0.171, 0.355]] as const) {
        expect(left.results.overall[name].reject_rate).toBeCloseTo(a, 3);
        expect(right.results.overall[name].reject_rate).toBeCloseTo(b, 3);
      }
      // The disagreement list on full data: the first view stores the pair's disagreements, later pages read them.
      const disagreements = `${url}/api/evaluations/${output.evaluations.llava_34b}/disagreements/${output.evaluations['qwen2.5vl_72b_v2']}`;
      const timed = async (query: string) => {
        const started = Date.now();
        const response = await fetch(`${disagreements}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
        return { body: (await response.json()) as { data: { pagination: { total: number } } }, ms: Date.now() - started };
      };
      const first = await timed('field=outcome&limit=20');
      const later = await timed('field=outcome&limit=20&page=50');
      const filtered = await timed('field=outcome&class=pedestrian&a=keep&b=delete&limit=20');
      expect(first.body.data.pagination.total).toBe(27_285);
      expect(later.body.data.pagination.total).toBe(27_285);
      expect(later.ms).toBeLessThan(1_000);
      console.log('Disagreements:', { firstMs: first.ms, laterMs: later.ms, filteredMs: filtered.ms, filteredTotal: filtered.body.data.pagination.total });
      console.log('Local migration comparisons:', JSON.stringify(fields.map(({ field, groups }) => ({ field, mask: groups.find(item => item.groupBy === 'role' && item.value === 'classify') }))));
    } finally {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      await mongoose.disconnect();
      await mongo?.stop();
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  }, 1_000_000);
});
