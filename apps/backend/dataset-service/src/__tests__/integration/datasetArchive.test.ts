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

import { Readable } from 'stream';
import { BadGatewayError, createApiKey, ServiceUnavailableError } from '@visin/backend-core';
import { enqueueImport, enqueueScan, removeQueuedImport } from '../../queue/importQueue';
import { markScanFailed } from '../../services/scanService';
import { NonRetryableImportError } from '../../utils/boundedZip';
import { markImportFailed } from '../../services/importService';
import { Dataset } from '../../models/Dataset';
import { fileStore } from '../fixtures/fileStore';
import { zip } from '../fixtures/zip';
import { OWNER, STRANGER, baseUrl, call, createDataset, runCurrentScan, tokenFor, uploadZip, useDatasetApi } from '../fixtures/datasetApi';

useDatasetApi();

describe('archive upload, download and import', () => {
  it.each(['reserve', 'resume', 'complete'])('refuses %s when a hold arrives during file-service work', async (operation) => {
    const id = await createDataset();
    const first = await uploadZip(id, [{ path: 'old.png', data: Buffer.from('old') }]);
    const upload = (filename: string) => call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename } });
    const pending = (await upload('new.zip')).body.data.uploadUrl.replace('upload:', '');
    if (operation === 'complete') fileStore.stored.set(pending, Buffer.from('new archive'));
    const hold = async () => {
      await Dataset.updateOne({ _id: id }, { $push: { holds: { service: 'label-service', ref: 'late', createdAt: new Date() } } });
    };
    if (operation === 'complete') {
      jest.mocked(fileStore.client.getFileSize).mockImplementationOnce(async (fileId) => { const size = fileStore.stored.get(fileId)?.length ?? null; await hold(); return size; });
    } else {
      jest.mocked(fileStore.client.getUploadUrl).mockImplementationOnce(async (fileId) => { await hold(); return { url: `upload:${fileId}`, expiresMs: Date.now() + 60_000 }; });
    }
    const scans = jest.mocked(enqueueScan).mock.calls.length;
    const response = operation === 'complete'
      ? await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })
      : await upload(operation === 'resume' ? 'new.zip' : 'other.zip');
    expect(response.status).toBe(409);
    const stored = (await Dataset.findById(id))!;
    expect(stored.archive!.fileId).toBe(first.fileId);
    expect(stored.pendingUpload!.fileId).toBe(pending);
    expect(fileStore.stored.has(first.fileId)).toBe(true);
    expect(jest.mocked(enqueueScan).mock.calls).toHaveLength(scans);
  });

  it('never deletes a pending archive adopted while a replacement reservation is waiting', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'first.zip' } });
    const pending = reserved.body.data.uploadUrl.replace('upload:', '');
    fileStore.stored.set(pending, Buffer.from('first archive'));
    jest.mocked(fileStore.client.getUploadUrl).mockImplementationOnce(async (fileId) => {
      expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(200);
      return { url: `upload:${fileId}`, expiresMs: Date.now() + 60_000 };
    });
    const other = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'other.zip' } });
    expect(other.status).toBe(409);
    expect((await Dataset.findById(id))!.archive!.fileId).toBe(pending);
    expect(fileStore.stored.has(pending)).toBe(true);
  });

  it('serializes concurrent reservations without overwriting the winner', async () => {
    const id = await createDataset();
    let release!: () => void;
    const both = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    jest.mocked(fileStore.client.getUploadUrl).mockImplementation(async (fileId) => {
      if (++calls === 2) release();
      await both;
      return { url: `upload:${fileId}`, expiresMs: Date.now() + 60_000 };
    });
    const responses = await Promise.all(['one.zip', 'two.zip'].map((filename) =>
      call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename } })));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses.find((response) => response.status === 201)!;
    expect((await Dataset.findById(id))!.pendingUpload!.fileId).toBe(winner.body.data.uploadUrl.replace('upload:', ''));
  });

  it('retains a failed discard for retry and prevents adopting its bytes', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } });
    const pending = reserved.body.data.uploadUrl.replace('upload:', '');
    fileStore.stored.set(pending, Buffer.from('archive'));
    jest.mocked(fileStore.client.deleteFile).mockRejectedValueOnce(new Error('files down'));
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER })).status).toBe(500);
    expect((await Dataset.findById(id))!.pendingUpload!.discarding).toBe(true);
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } })).status).toBe(409);
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER })).status).toBe(200);
    expect(fileStore.stored.has(pending)).toBe(false);
  });

  it('does not discard an archive when completion wins first', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: { filename: 'set.zip' } });
    const pending = reserved.body.data.uploadUrl.replace('upload:', '');
    fileStore.stored.set(pending, Buffer.from('archive'));
    const update = Dataset.updateOne.bind(Dataset);
    const spy = jest.spyOn(Dataset, 'updateOne').mockImplementationOnce(((...args: Parameters<typeof Dataset.updateOne>) =>
      call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER }).then(() => update(...args))
    ) as unknown as typeof Dataset.updateOne);
    try {
      expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER })).status).toBe(409);
      expect(fileStore.stored.has(pending)).toBe(true);
      expect((await Dataset.findById(id))!.archive!.fileId).toBe(pending);
    } finally { spy.mockRestore(); }
  });

  it('adopts the zip at once, reads its index in the background, and replaces a previous archive', async () => {
    const id = await createDataset();
    expect(
      (
        await call(`/api/datasets/${id}/archive/upload-url`, {
          method: 'POST',
          user: OWNER,
          body: { filename: 'set.tar' }
        })
      ).status
    ).toBe(400);
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(400);
    expect((await call(`/api/datasets/${id}/download`)).status).toBe(400);

    const first = await uploadZip(id, [
      { path: 'frames/1.png', data: Buffer.from('x') },
      { path: 'lidar/1.bin', data: Buffer.alloc(10) }
    ]);
    expect(first.completed.status).toBe(200);
    // The request returns before the zip is read: the browser can leave now.
    expect(first.completed.body.data).toMatchObject({ archive: { filename: 'set.zip' }, scan: { status: 'queued' } });
    expect(first.completed.body.data).not.toHaveProperty('contents');
    expect(enqueueScan).toHaveBeenCalledWith({ datasetId: id, fileId: first.fileId, scanId: expect.any(String) });

    // What the worker does with that job.
    await runCurrentScan(id, first.fileId);
    const scanned = (await call(`/api/datasets/${id}`)).body.data;
    expect(scanned.contents).toMatchObject({ entries: 2, totalBytes: 11 });
    expect(scanned.scan.status).toBe('done');

    const second = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    expect(second.completed.status).toBe(200);
    expect(fileStore.stored.has(first.fileId)).toBe(false);
    expect((await call(`/api/datasets/${id}/download`)).body.data).toMatchObject({
      downloadUrl: `signed:${second.fileId}`,
      size: second.completed.body.data.archive.size,
      revision: second.completed.body.data.archive.uploadedAt
    });
  });

  it('scans a zip that is already stored — what a migrated dataset starts with', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER })).status).toBe(400);

    const fileId = `label-bundles/${id}/upload.zip`;
    fileStore.stored.set(fileId, zip([{ path: 'frames/1.png', data: Buffer.from('xy') }]));
    await Dataset.updateOne(
      { _id: id },
      { $set: { archive: { fileId, filename: 'upload.zip', uploadedAt: new Date() } } }
    );
    expect((await call(`/api/datasets/${id}`)).body.data.archive).not.toHaveProperty('size');

    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: STRANGER })).status).toBe(403);
    const queued = await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER });
    expect(queued.status).toBe(200);
    expect(queued.body.data.scan).toEqual({ status: 'queued' });
    expect(enqueueScan).toHaveBeenCalledWith({ datasetId: id, fileId, scanId: expect.any(String) });

    await runCurrentScan(id, fileId);
    const scanned = (await call(`/api/datasets/${id}`)).body.data;
    expect(scanned.archive.size).toBeGreaterThan(0);
    expect(scanned.contents).toMatchObject({ entries: 1, totalBytes: 2 });
  });

  it('resumes an interrupted upload of the same file, and drops an abandoned one for another', async () => {
    const id = await createDataset();
    const file = { filename: 'set.zip', size: 4000, lastModified: 17 };
    const upload = (body: object) =>
      call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body });

    const first = (await upload(file)).body.data;
    expect(first).toMatchObject({ uploaded: false, resumed: false });
    expect((await call(`/api/datasets/${id}`)).body.data.uploading).toEqual({ filename: 'set.zip', size: 4000 });

    // The same file again continues the same reservation.
    const again = (await upload(file)).body.data;
    expect(again).toMatchObject({ uploadUrl: first.uploadUrl, resumed: true, uploaded: false });

    // Every byte had arrived: only finishing is left.
    const fileId = first.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('bytes'));
    expect((await upload(file)).body.data).toEqual({ uploaded: true, resumed: true });

    // A different file (same name, other size) starts over and deletes the abandoned bytes.
    const other = (await upload({ ...file, size: 5000 })).body.data;
    expect(other).toMatchObject({ resumed: false });
    expect(other.uploadUrl).not.toBe(first.uploadUrl);
    expect(fileStore.stored.has(fileId)).toBe(false);
  });

  it('discards an interrupted upload and its partial bytes', async () => {
    const id = await createDataset();
    const reserved = (
      await call(`/api/datasets/${id}/archive/upload-url`, {
        method: 'POST',
        user: OWNER,
        body: { filename: 'set.zip' }
      })
    ).body.data;
    const fileId = reserved.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('partial'));
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    const discarded = await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER });
    expect(discarded.status).toBe(200);
    expect(discarded.body.data.uploading).toBeUndefined();
    expect(fileStore.stored.has(fileId)).toBe(false);
    expect((await call(`/api/datasets/${id}/archive/upload`, { method: 'DELETE', user: OWNER })).status).toBe(200);
  });

  it('starts over when an interrupted reservation can no longer be resumed', async () => {
    const id = await createDataset();
    const file = { filename: 'set.zip', size: 4000, lastModified: 17 };
    const first = (await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: file }))
      .body.data;
    jest.mocked(fileStore.client.getUploadUrl).mockRejectedValueOnce(new Error('Upload path is already reserved'));
    jest.mocked(fileStore.client.deleteFile).mockRejectedValueOnce(new Error('file-service down'));
    const next = (await call(`/api/datasets/${id}/archive/upload-url`, { method: 'POST', user: OWNER, body: file }))
      .body.data;
    expect(next).toMatchObject({ resumed: false });
    expect(next.uploadUrl).not.toBe(first.uploadUrl);
  });

  it('refuses to finish an upload that never arrived, and reports a file that is not a zip', async () => {
    const id = await createDataset();
    const reserved = await call(`/api/datasets/${id}/archive/upload-url`, {
      method: 'POST',
      user: OWNER,
      body: { filename: 'set.zip' }
    });
    // The upload is still pending, so the page can offer to finish it later.
    expect((await call(`/api/datasets/${id}`)).body.data.uploading).toEqual({ filename: 'set.zip' });
    expect(
      (await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).body.message
    ).toContain('upload the zip again');

    const fileId = reserved.body.data.uploadUrl.replace('upload:', '');
    fileStore.stored.set(fileId, Buffer.from('definitely not a zip file'));
    expect((await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER })).status).toBe(200);

    await expect(runCurrentScan(id, fileId)).rejects.toThrow(/not a readable zip archive \(.+\)/);
    await markScanFailed(id, fileId, 'The uploaded file is not a readable zip archive', (await Dataset.findById(id).lean())?.scan?.id);
    expect((await call(`/api/datasets/${id}`)).body.data.scan).toMatchObject({
      status: 'failed',
      error: 'The uploaded file is not a readable zip archive'
    });
  });

  it('retries a scan file-service could not serve, instead of calling the zip unreadable', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'a.txt', data: Buffer.from('hi') }]);
    jest
      .mocked(fileStore.client.getFileRange)
      .mockRejectedValueOnce(new BadGatewayError('file-service ignored a Range request'));
    const failure = await runCurrentScan(id, fileId).catch((err: Error) => err);
    expect(failure).toBeInstanceOf(BadGatewayError);
    expect(failure).not.toBeInstanceOf(NonRetryableImportError);
    jest.mocked(fileStore.client.getFileRange).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(runCurrentScan(id, fileId)).rejects.toThrow('fetch failed');
    await runCurrentScan(id, fileId);
    expect((await call(`/api/datasets/${id}`)).body.data.scan.status).toBe('done');
  });

  it('ignores a scan whose archive has since been replaced, or whose file is gone', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('x') }]);
    await runCurrentScan(id, 'some/older/upload.zip');
    expect((await Dataset.findById(id).lean())?.scan?.status).toBe('queued');

    fileStore.stored.delete(fileId);
    await expect(runCurrentScan(id, fileId)).rejects.toThrow('no longer stored');
  });

  it('queues, refuses a second, and cancels an import', async () => {
    const id = await createDataset();
    const mapping = { groups: [{ folder: 'frames/', group: 'frames' }] };
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping })).status).toBe(400);
    await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    expect(
      (await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: { groups: [] } })).status
    ).toBe(400);
    expect(
      (
        await call(`/api/datasets/${id}/import`, {
          method: 'POST',
          user: OWNER,
          body: {
            groups: [
              { folder: 'a', group: 'x' },
              { folder: 'a/', group: 'y' }
            ]
          }
        })
      ).status
    ).toBe(400);

    const started = await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping });
    expect(started.status).toBe(202);
    expect(started.body.data.import).toMatchObject({
      status: 'queued',
      mapping: { groups: [{ folder: 'frames', group: 'frames' }] }
    });
    expect(enqueueImport).toHaveBeenCalledWith({ datasetId: id, importId: started.body.data.import.id });
    expect((await call(`/api/datasets/${id}/import`, { method: 'POST', user: OWNER, body: mapping })).status).toBe(409);
    expect(
      (
        await call(`/api/datasets/${id}/archive/upload-url`, {
          method: 'POST',
          user: OWNER,
          body: { filename: 'b.zip' }
        })
      ).status
    ).toBe(409);

    const cancelled = await call(`/api/datasets/${id}/import`, { method: 'DELETE', user: OWNER });
    expect(cancelled.body.data.import.status).toBe('cancelled');
    expect(removeQueuedImport).toHaveBeenCalledWith(started.body.data.import.id);
    expect((await call(`/api/datasets/${id}/import`, { method: 'DELETE', user: OWNER })).status).toBe(409);
  });

  it('answers 503 after a failed enqueue while retaining the work recovery needs', async () => {
    const id = await createDataset();
    await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    jest.mocked(enqueueImport).mockRejectedValueOnce(new ServiceUnavailableError('Dataset queue unavailable'));
    const refused = await call(`/api/datasets/${id}/import`, {
      method: 'POST', user: OWNER, body: { groups: [{ folder: 'frames', group: 'camera' }] }
    });
    expect(refused.status).toBe(503);
    expect((await Dataset.findById(id).lean())?.import?.status).toBe('queued');
    expect((await call(`/api/datasets/${id}/import`, {
      method: 'POST', user: OWNER, body: { groups: [{ folder: 'frames', group: 'camera' }] }
    })).status).toBe(409);
    jest.mocked(enqueueScan).mockRejectedValueOnce(new ServiceUnavailableError('Dataset queue unavailable'));
    expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER })).status).toBe(503);
    expect((await Dataset.findById(id).lean())?.scan).toMatchObject({ status: 'queued', id: expect.any(String) });
  });

  it('deletes a replaced zip even when the new one cannot be queued for scanning', async () => {
    const id = await createDataset();
    const first = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('x') }]);
    jest.mocked(enqueueScan).mockRejectedValueOnce(new ServiceUnavailableError('Dataset queue unavailable'));
    const second = await uploadZip(id, [{ path: 'b.png', data: Buffer.from('y') }]);
    expect(second.completed.status).toBe(503);
    expect(fileStore.stored.has(first.fileId)).toBe(false);
    expect(await Dataset.findById(id).lean()).toMatchObject({
      archive: { fileId: second.fileId },
      scan: { status: 'queued', fileId: second.fileId }
    });
  });

  it('answers a repeated completion with the adopted archive after the queue was unavailable', async () => {
    const id = await createDataset();
    jest.mocked(enqueueScan).mockRejectedValueOnce(new ServiceUnavailableError('Dataset queue unavailable'));
    const first = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('x') }]);
    expect(first.completed.status).toBe(503);
    const again = await call(`/api/datasets/${id}/archive/complete`, { method: 'POST', user: OWNER });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ archive: { filename: 'set.zip' }, scan: { status: 'queued' } });
  });

  it('refuses a rescan of a zip replaced while the request was in flight', async () => {
    const id = await createDataset();
    const first = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('x') }]);
    const scansOfFirst = () => jest.mocked(enqueueScan).mock.calls.filter(([data]) => data.fileId === first.fileId).length;
    const before = scansOfFirst();
    let second: Awaited<ReturnType<typeof uploadZip>> | undefined;
    const findOneAndUpdate = Dataset.findOneAndUpdate.bind(Dataset);
    const spy = jest.spyOn(Dataset, 'findOneAndUpdate').mockImplementationOnce(((...args: Parameters<typeof Dataset.findOneAndUpdate>) =>
      uploadZip(id, [{ path: 'b.png', data: Buffer.from('y') }]).then((done) => {
        second = done;
        return findOneAndUpdate(...args);
      })
    ) as unknown as typeof Dataset.findOneAndUpdate);
    try {
      expect((await call(`/api/datasets/${id}/archive/scan`, { method: 'POST', user: OWNER })).status).toBe(409);
    } finally { spy.mockRestore(); }
    expect(second!.completed.status).toBe(200);
    expect((await Dataset.findById(id).lean())?.scan).toMatchObject({ status: 'queued', fileId: second!.fileId });
    expect(scansOfFirst()).toBe(before);
  });

  it('waits for recovery to close a stale running import before replacing it', async () => {
    const id = await createDataset();
    await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    await Dataset.updateOne(
      { _id: id },
      {
        $set: {
          import: {
            id: 'dead',
            status: 'running',
            heartbeatAt: new Date(Date.now() - 3600_000),
            mapping: { groups: [] },
            archiveFileId: 'x',
            processed: 0,
            skipped: 0,
            errors: []
          }
        }
      }
    );
    const begin = () => call(`/api/datasets/${id}/import`, {
      method: 'POST',
      user: OWNER,
      body: { groups: [{ folder: '', group: 'all' }], manifest: './m.csv' }
    });
    expect((await begin()).status).toBe(409);
    await markImportFailed(id, 'dead', 'Queue delivery disappeared');
    const started = await begin();
    expect(started.status).toBe(202);
    expect(removeQueuedImport).not.toHaveBeenCalled();
    expect(started.body.data.import.mapping.manifest).toBe('m.csv');
  });
});

describe('the zip streamed in the response (a dataspace connector)', () => {
  const licensed = (body: Record<string, unknown> = {}) =>
    createDataset({ name: 'Sample', visibility: 'public', license: { id: 'cc-by-4.0' }, ...body });
  const withArchive = async (id: string, data: Buffer, filename = 'iseauto sample.zip') => {
    fileStore.stored.set('archive', data);
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId: 'archive', filename, size: data.length, uploadedAt: new Date('2026-10-12T09:27:04Z') } } });
  };
  const fetchArchive = (id: string, authorization?: string) =>
    fetch(`${baseUrl}/api/datasets/${id}/archive`, { headers: authorization ? { Authorization: authorization } : {} });

  it('sends the bytes themselves, named and sized, to an anonymous caller of a public dataset', async () => {
    const id = await licensed();
    const data = zip([{ path: 'labeled/day_fair/camera/1.png', data: Buffer.from('frame') }]);
    await withArchive(id, data);

    const response = await fetchArchive(id);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="iseauto_sample.zip"');
    expect(response.headers.get('content-length')).toBe(String(data.length));
    expect(response.headers.get('last-modified')).toBe('Mon, 12 Oct 2026 09:27:04 GMT');
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
  });

  it('serves a private dataset to its owner’s API key and to no one else', async () => {
    const id = await licensed({ visibility: 'private' });
    await withArchive(id, Buffer.from('zip bytes'));
    const { token } = await createApiKey({
      userId: OWNER,
      userEmail: `${OWNER}@example.test`,
      userName: 'Owner',
      name: 'connector',
      scopes: ['dataset:read']
    });

    const response = await fetchArchive(id, `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('zip bytes');
    expect((await fetchArchive(id, `Bearer ${tokenFor(STRANGER)}`)).status).toBe(403);
    expect((await fetchArchive(id)).status).toBe(401);
  });

  it('sends an archive with no recorded size whole and chunked, even when a range is asked for', async () => {
    const id = await licensed();
    fileStore.stored.set('archive', Buffer.from('zip bytes'));
    await Dataset.updateOne({ _id: id }, { $set: { archive: { fileId: 'archive', filename: 'set.zip', uploadedAt: new Date() } } });

    const response = await fetch(`${baseUrl}/api/datasets/${id}/archive`, { headers: { Range: 'bytes=4-' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('accept-ranges')).toBeNull();
    expect(await response.text()).toBe('zip bytes');
  });

  describe('resuming', () => {
    const data = Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 251));
    const ranged = (id: string, headers: Record<string, string>, method = 'GET') =>
      fetch(`${baseUrl}/api/datasets/${id}/archive`, { method, headers });

    it('sends the rest of the zip from where a client stopped, or any one range of it', async () => {
      const id = await licensed();
      await withArchive(id, data);

      const rest = await ranged(id, { Range: 'bytes=100-' });
      expect(rest.status).toBe(206);
      expect(rest.headers.get('content-range')).toBe('bytes 100-1023/1024');
      expect(rest.headers.get('content-length')).toBe('924');
      expect(rest.headers.get('accept-ranges')).toBe('bytes');
      expect(Buffer.from(await rest.arrayBuffer()).equals(data.subarray(100))).toBe(true);
      expect(fileStore.client.getFileRange).toHaveBeenCalledWith('archive', 100, 1023);
      expect(fileStore.client.getFileStream).not.toHaveBeenCalled();

      const middle = await ranged(id, { Range: 'bytes=10-19' });
      expect(middle.headers.get('content-range')).toBe('bytes 10-19/1024');
      expect(Buffer.from(await middle.arrayBuffer()).equals(data.subarray(10, 20))).toBe(true);
      const tail = await ranged(id, { Range: 'bytes=-24' });
      expect(Buffer.from(await tail.arrayBuffer()).equals(data.subarray(1000))).toBe(true);
    });

    it('resumes only the same upload: a replaced zip is sent whole, never spliced onto the old one', async () => {
      const id = await licensed();
      await withArchive(id, data);
      const first = await fetchArchive(id);
      const tag = first.headers.get('etag')!;
      const lastModified = first.headers.get('last-modified')!;
      await first.arrayBuffer();

      expect((await ranged(id, { Range: 'bytes=100-', 'If-Range': tag })).status).toBe(206);
      expect((await ranged(id, { Range: 'bytes=100-', 'If-Range': lastModified })).status).toBe(206);

      await Dataset.updateOne({ _id: id }, { $set: { 'archive.uploadedAt': new Date('2026-10-13T00:00:00Z') } });
      const replaced = await ranged(id, { Range: 'bytes=100-', 'If-Range': tag });
      expect(replaced.status).toBe(200);
      expect(replaced.headers.get('etag')).not.toBe(tag);
      expect(Buffer.from(await replaced.arrayBuffer()).equals(data)).toBe(true);
    });

    it('sends the whole zip for several ranges or a header it cannot read, and refuses one past the end', async () => {
      const id = await licensed();
      await withArchive(id, data);

      for (const header of ['bytes=0-9,20-29', 'bytes=abc', 'lines=1-2']) {
        const whole = await ranged(id, { Range: header });
        expect(whole.status).toBe(200);
        expect((await whole.arrayBuffer()).byteLength).toBe(1024);
      }

      const past = await ranged(id, { Range: 'bytes=2000-' });
      expect(past.status).toBe(416);
      expect(past.headers.get('content-range')).toBe('bytes */1024');
      expect(fileStore.client.getFileRange).not.toHaveBeenCalled();
    });

    it('answers HEAD with the headers alone, reading nothing from storage', async () => {
      const id = await licensed();
      await withArchive(id, data);

      const head = await ranged(id, {}, 'HEAD');
      expect(head.status).toBe(200);
      expect(head.headers.get('content-length')).toBe('1024');
      expect(head.headers.get('etag')).toBeTruthy();
      const partial = await ranged(id, { Range: 'bytes=1000-' }, 'HEAD');
      expect(partial.status).toBe(206);
      expect(partial.headers.get('content-range')).toBe('bytes 1000-1023/1024');
      expect(fileStore.client.getFileStream).not.toHaveBeenCalled();
      expect(fileStore.client.getFileRange).not.toHaveBeenCalled();
    });

    it('answers 502 when storage cannot read the range', async () => {
      const id = await licensed();
      await withArchive(id, data);
      jest.mocked(fileStore.client.getFileRange).mockRejectedValueOnce(new Error('file-service ignored a Range request'));

      expect((await ranged(id, { Range: 'bytes=100-' })).status).toBe(502);
    });
  });

  it('refuses a dataset with no zip, or one that declares no licence', async () => {
    const empty = await licensed();
    expect((await call(`/api/datasets/${empty}/archive`)).status).toBe(404);

    const unstated = await createDataset({ name: 'Unstated', visibility: 'public' });
    await withArchive(unstated, Buffer.from('zip bytes'));
    const refused = await call(`/api/datasets/${unstated}/archive`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/licence/);
    expect(fileStore.client.getFileStream).not.toHaveBeenCalled();
  });

  it('answers 502 when storage cannot be read, before any byte is sent', async () => {
    const id = await licensed();
    await withArchive(id, Buffer.from('zip bytes'));
    jest.mocked(fileStore.client.getFileStream).mockRejectedValueOnce(new Error('file-service get failed (404)'));

    expect((await call(`/api/datasets/${id}/archive`)).status).toBe(502);
  });

  it('cuts the response short when storage fails part way, rather than end it as if whole', async () => {
    const id = await licensed();
    await withArchive(id, Buffer.alloc(1024));
    jest.mocked(fileStore.client.getFileStream).mockResolvedValueOnce(
      new Readable({
        read() {
          this.push(Buffer.alloc(100));
          this.destroy(new Error('storage went away'));
        }
      })
    );

    // Whether the client has seen the 200 by then is a race; it never gets a body that ends cleanly.
    await expect(fetchArchive(id).then((response) => response.arrayBuffer())).rejects.toThrow();
  });
});

describe('resuming an import', () => {
  it('queues a cancelled or failed import again under its own id', async () => {
    const id = await createDataset();
    const resume = () => call(`/api/datasets/${id}/import/resume`, { method: 'POST', user: OWNER });
    expect((await resume()).status).toBe(409);

    const { fileId } = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    const importState = (status: string, archiveFileId = fileId) => ({
      id: 'imp',
      status,
      archiveFileId,
      mapping: { groups: [{ folder: 'frames', group: 'frames' }] },
      processed: 100,
      skipped: 0,
      errors: [{ path: '(zip)', reason: 'The database ran out of space' }],
      finishedAt: new Date()
    });
    await Dataset.updateOne({ _id: id }, { $set: { import: importState('running') } });
    expect((await resume()).status).toBe(409);

    await Dataset.updateOne({ _id: id }, { $set: { import: importState('cancelled', 'older.zip') } });
    expect((await resume()).body.message).toContain('zip was replaced');

    await Dataset.updateOne({ _id: id }, { $set: { import: importState('failed') } });
    expect((await call(`/api/datasets/${id}/import/resume`, { method: 'POST', user: STRANGER })).status).toBe(403);
    const resumed = await resume();
    expect(resumed.status).toBe(202);
    expect(resumed.body.data.import).toMatchObject({ id: 'imp', status: 'queued', processed: 100, errors: [] });
    expect(removeQueuedImport).toHaveBeenCalledWith('imp');
    expect(enqueueImport).toHaveBeenCalledWith({ datasetId: id, importId: 'imp', deliveryId: expect.any(String) });
    expect((await resume()).status).toBe(409);
  });
});
