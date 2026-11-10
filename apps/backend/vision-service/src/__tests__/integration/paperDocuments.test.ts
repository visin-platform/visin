import { vi } from 'vitest';
import { createServer, type Server } from 'http';
import { Readable } from 'stream';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestError, errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { deleteFile, getFileStream, putFile } from '../../clients/fileServiceClient';
import { getPaperForAssistant, readPaper, searchPaper } from '../../controllers/paperDocumentController';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import { projectTokenContext } from '../../middleware/projectTokenContext';
import Paper from '../../models/Paper';
import PaperDocument from '../../models/PaperDocument';
import PaperPage from '../../models/PaperPage';
import paperDocumentRoutes from '../../routes/paperDocumentRoutes';
import paperRoutes from '../../routes/paperRoutes';
import { indexPaper, pdfSourceOf } from '../../services/paperDocumentService';
import { fetchPdf } from '../../services/paperPdfFetch';
import { purgeExpiredTrash } from '../../services/purgeService';
import { pdfWithPages } from '../fixtures/pdf';

vi.mock('../../clients/projectGroupsClient', async () => {
  const module = await (() => ({ getUserGroups: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../clients/ownerIdentityClient', async () => {
  const module = await (() => ({ lookupOwnerIdentities: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/paperPdfFetch', () => ({ fetchPdf: vi.fn() }));
vi.mock('../../clients/fileServiceClient', async () => ({
  ...(await vi.importActual<object>('../../clients/fileServiceClient')),
  putFile: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(async () => true)
}));

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000002';

const PAGES = [
  'Abstract. We study camera and LiDAR fusion.',
  'Table 2. Val mean IoU 0.7591 at epoch 63 on iSeAuto.',
  'Conclusion. Fusion helps at night.'
];

/** A paper's PDF is read once, kept, shown to whoever may read the paper, and searched by an assistant, never changed by one. */
describe('paper documents, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'paper-documents-test-secret';
  const previousSecret = process.env.JWT_SECRET;
  /** what "file storage" holds, by file id */
  const stored = new Map<string, Buffer>();

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Paper.syncIndexes();
    await PaperDocument.syncIndexes();
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/api/papers', paperRoutes);
    app.use('/api/paper-documents', paperDocumentRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 120_000);

  beforeEach(async () => {
    const ids = [OWNER, STRANGER].map((id) => new mongoose.Types.ObjectId(id));
    await mongoose.connection
      .collection('users')
      .insertMany(ids.map((_id) => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection
      .collection('user_sessions')
      .insertMany(ids.map((_id) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    vi.mocked(getUserGroups).mockResolvedValue([]);
    vi.mocked(lookupOwnerIdentities).mockResolvedValue(new Map());
    stored.clear();
    vi.mocked(fetchPdf)
      .mockReset()
      .mockResolvedValue({ bytes: pdfWithPages(PAGES), finalUrl: 'https://papers.example.test/a.pdf' });
    vi.mocked(putFile)
      .mockReset()
      .mockImplementation(async (fileId, bytes) => void stored.set(fileId, bytes));
    vi.mocked(getFileStream)
      .mockReset()
      .mockImplementation(async (fileId) => Readable.from([stored.get(fileId) ?? Buffer.alloc(0)]));
    vi.mocked(deleteFile).mockClear();
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  // oxlint-disable-next-line typescript/no-explicit-any
  type Body = { data: any; message?: string };
  const call = async (path: string, user: string | '' = OWNER) => {
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      {
        id: user,
        email: `${user}@example.test`,
        tokenVersion: 1,
        sid: user,
        typ: 'session',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60
      }
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, { headers: user ? { Authorization: `Bearer ${token}` } : {} });
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = bytes.toString('utf8');
    return {
      status: response.status,
      bytes,
      headers: response.headers,
      body: (text.startsWith('{') ? JSON.parse(text) : {}) as Body
    };
  };
  const post = async (path: string, user = OWNER) => {
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      {
        id: user,
        email: `${user}@example.test`,
        tokenVersion: 1,
        sid: user,
        typ: 'session',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60
      }
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    return { status: response.status };
  };
  const paper = (fields: Record<string, unknown> = {}) =>
    Paper.create({
      title: 'Fusion at night',
      authors: [{ name: 'Ann Author' }],
      pdfUrl: 'https://papers.example.test/a.pdf',
      owner: { kind: 'user', id: OWNER },
      createdBy: OWNER,
      visibility: 'private',
      ...fields
    });

  it('reads the PDF into storage and text, page by page', async () => {
    const draft = await paper();
    await indexPaper(draft);

    const doc = await PaperDocument.findOne({ paperId: String(draft._id) });
    const pages = await PaperPage.find({ paperId: String(draft._id) }).sort({ n: 1 });
    expect(doc).toMatchObject({ status: 'ready', pageCount: 3, sourceUrl: 'https://papers.example.test/a.pdf' });
    expect(pages.map((page) => page.n)).toEqual([1, 2, 3]);
    expect(pages[1].text).toContain('0.7591');
    expect(stored.get(doc!.fileId!)!.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await call(`/papers/${draft._id}/document`)).body.data).toMatchObject({
      status: 'ready',
      viewable: true,
      pageCount: 3
    });
  });

  it('does not read a paper twice, but reads it again when its address changes or the owner asks', async () => {
    const draft = await paper();
    await indexPaper(draft);
    await indexPaper(draft);
    expect(fetchPdf).toHaveBeenCalledTimes(1);

    draft.pdfUrl = 'https://papers.example.test/b.pdf';
    await indexPaper(draft);
    expect(fetchPdf).toHaveBeenCalledTimes(2);

    expect((await post(`/papers/${draft._id}/document/refresh`)).status).toBe(202);
    await vi.waitFor(() => expect(fetchPdf).toHaveBeenCalledTimes(3));
    expect((await post(`/papers/${draft._id}/document/refresh`, STRANGER)).status).toBe(404);
  });

  it('reads an arXiv paper from arXiv when the owner gave no PDF address', () => {
    expect(pdfSourceOf({ arxivId: '2401.01234' })).toBe('https://arxiv.org/pdf/2401.01234');
    expect(pdfSourceOf({ arxivId: '../../etc/passwd' })).toBeNull();
    expect(pdfSourceOf({ pdfUrl: 'https://x.example.test/p.pdf', arxivId: '2401.01234' })).toBe(
      'https://x.example.test/p.pdf'
    );
    expect(pdfSourceOf({})).toBeNull();
  });

  it('says why a PDF could not be read, without the server’s own message, and keeps the paper', async () => {
    vi.mocked(fetchPdf).mockRejectedValueOnce(new BadRequestError('That address did not return a PDF'));
    const draft = await paper();
    await indexPaper(draft);
    expect((await call(`/papers/${draft._id}/document`)).body.data).toMatchObject({
      status: 'failed',
      viewable: false,
      error: 'That address did not return a PDF'
    });

    vi.mocked(fetchPdf).mockRejectedValueOnce(new Error('ECONNRESET 10.0.0.5:443'));
    await indexPaper(draft, { force: true });
    const { error } = (await call(`/papers/${draft._id}/document`)).body.data;
    expect(error).toBe('The PDF could not be read');
  });

  it('has nothing to read for a paper with no PDF address', async () => {
    const none = await paper({ pdfUrl: undefined });
    expect((await call(`/papers/${none._id}/document`)).body.data).toMatchObject({ status: 'none', viewable: false });
    expect(fetchPdf).not.toHaveBeenCalled();
  });

  it('shows the PDF in place to whoever may read the paper, and to no one else', async () => {
    const draft = await paper();
    await indexPaper(draft);

    const mine = await call(`/papers/${draft._id}/pdf`);
    expect(mine.status).toBe(200);
    expect(mine.headers.get('content-type')).toBe('application/pdf');
    expect(mine.headers.get('content-disposition')).toContain('inline');
    expect(mine.bytes.subarray(0, 5).toString()).toBe('%PDF-');

    // A draft is not confirmed to exist, by its document or by its text.
    expect((await call(`/papers/${draft._id}/pdf`, STRANGER)).status).toBe(404);
    expect((await call(`/papers/${draft._id}/document`, '')).status).toBe(404);
    expect((await call(`/paper-documents/${draft._id}/search?q=mIoU`, STRANGER)).status).toBe(404);

    await Paper.updateOne({ _id: draft._id }, { $set: { visibility: 'public' } });
    expect((await call(`/papers/${draft._id}/pdf`, '')).status).toBe(200);
  });

  it('has no PDF to show while it is still being read', async () => {
    const draft = await paper();
    expect((await call(`/papers/${draft._id}/pdf`)).status).toBe(404);
  });

  it('starts reading a paper made before this existed, the first time its state is asked for', async () => {
    const old = await paper();
    expect((await call(`/papers/${old._id}/document`)).body.data).toMatchObject({ status: 'pending' });
    await vi.waitFor(() => expect(fetchPdf).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect((await call(`/papers/${old._id}/document`)).body.data.status).toBe('ready'));
  });

  it('sends the PDF without a length when the record has none, and drops the connection if storage fails midway', async () => {
    const draft = await paper();
    await indexPaper(draft);
    await PaperDocument.updateOne({ paperId: String(draft._id) }, { $unset: { size: 1 } });
    const unsized = await call(`/papers/${draft._id}/pdf`);
    expect(unsized.status).toBe(200);
    expect(unsized.headers.get('content-length')).toBeNull();

    vi.mocked(getFileStream).mockResolvedValueOnce(
      new Readable({
        read() {
          this.destroy(new Error('disk gone'));
        }
      })
    );
    await expect(call(`/papers/${draft._id}/pdf`)).rejects.toThrow();
  });

  it('asks for a read again without waiting for it, even if the read itself fails to start', async () => {
    const draft = await paper();
    await indexPaper(draft);
    const failure = vi.spyOn(PaperDocument, 'findOne').mockRejectedValueOnce(new Error('db down') as never);
    expect((await post(`/papers/${draft._id}/document/refresh`)).status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 30));
    failure.mockRestore();
  });

  describe('for an assistant', () => {
    it('searches the text and quotes the pages that mention it, best first', async () => {
      const draft = await paper();
      await indexPaper(draft);

      const { status, body } = await call(`/paper-documents/${draft._id}/search?q=mean%20IoU%200.7591`);

      expect(status).toBe(200);
      expect(body.data.hits[0].page).toBe(2);
      expect(body.data.hits[0].snippets.join(' ')).toContain('0.7591');
      expect(body.data.hits.map((hit: { page: number }) => hit.page)).not.toContain(3);
      expect(body.data.pageCount).toBe(3);
      expect((await call(`/paper-documents/${draft._id}/search?q=zzzzqq`)).body.data.hits).toEqual([]);
      expect((await call(`/paper-documents/${draft._id}/search?q=a`)).status).toBe(400);
    });

    it('reads whole pages, in order', async () => {
      const draft = await paper();
      await indexPaper(draft);

      const one = await call(`/paper-documents/${draft._id}/pages?from=2`);
      expect(one.body.data.pages).toEqual([
        expect.objectContaining({ page: 2, text: expect.stringContaining('Table 2') })
      ]);

      const all = await call(`/paper-documents/${draft._id}/pages?from=1&to=3`);
      expect(all.body.data.pages.map((page: { page: number }) => page.page)).toEqual([1, 2, 3]);
      expect(all.body.data).not.toHaveProperty('next');
      expect((await call(`/paper-documents/${draft._id}/pages?from=9`)).status).toBe(404);
      expect((await call(`/paper-documents/${draft._id}/pages?from=3&to=1`)).status).toBe(400);
    });

    it('carries a long paper across reads without losing or cutting a page', async () => {
      // Twelve pages of about 5,000 characters: more than one read can carry, each page smaller than the budget.
      const filler = (n: number) => `Page ${n} ` + 'word '.repeat(900);
      const long = Array.from({ length: 12 }, (_, i) => filler(i + 1));
      vi.mocked(fetchPdf).mockResolvedValue({
        bytes: pdfWithPages(long),
        finalUrl: 'https://papers.example.test/long.pdf'
      });
      const draft = await paper({ pdfUrl: 'https://papers.example.test/long.pdf' });
      await indexPaper(draft);

      const seen: number[] = [];
      let from: number | undefined = 1;
      let reads = 0;
      while (from) {
        const { body } = await call(`/paper-documents/${draft._id}/pages?from=${from}&to=12`);
        for (const page of body.data.pages) {
          seen.push(page.page);
          expect(page).not.toHaveProperty('cut');
          expect(page.text.length).toBeGreaterThan(4000);
        }
        from = body.data.next;
        reads++;
        expect(reads).toBeLessThan(10);
      }

      expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(reads).toBeGreaterThan(1);
      expect(reads).toBeLessThan(6);
    });

    it('describes the paper, its cited results and whether its text can be searched', async () => {
      const draft = await paper();
      await indexPaper(draft);
      const { body } = await call(`/paper-documents/${draft._id}`);
      expect(body.data.paper).toMatchObject({ id: String(draft._id), title: 'Fusion at night' });
      expect(body.data.document).toMatchObject({ status: 'ready', pageCount: 3 });
    });

    it('cannot change a paper: no write route is mounted for it', async () => {
      const draft = await paper();
      const response = await fetch(`${baseUrl}/paper-documents/${draft._id}`, { method: 'PUT' });
      expect(response.status).toBe(404);
    });

    it('is refused for a key limited to one project, because a paper belongs to none', async () => {
      const draft = await paper();
      await indexPaper(draft);
      const json = vi.fn();
      const asKey = {
        params: { id: String(draft._id) },
        query: { q: 'mIoU' },
        user: { id: OWNER }
      } as unknown as express.Request;
      const run = (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
        projectTokenContext.run({ projectId: 'p1', userId: OWNER }, () =>
          handler(asKey, { json } as unknown as express.Response)
        );

      await expect(run(getPaperForAssistant)).rejects.toThrow('Paper not found');
      await expect(run(searchPaper)).rejects.toThrow('Paper not found');
      await expect(run(readPaper)).rejects.toThrow('Paper not found');
      expect(json).not.toHaveBeenCalled();
    });

    it('does not search a paper that has not been read', async () => {
      const draft = await paper();
      expect((await call(`/paper-documents/${draft._id}/search?q=mIoU`)).status).toBe(404);
    });
  });

  it('removes the stored PDF and its text when the paper is purged from the trash', async () => {
    const gone = await paper({ trashedAt: new Date(Date.now() - 40 * 86_400_000) });
    await indexPaper(gone);
    const fileId = (await PaperDocument.findOne({ paperId: String(gone._id) }))!.fileId!;

    await purgeExpiredTrash();

    expect(await PaperDocument.countDocuments({ paperId: String(gone._id) })).toBe(0);
    expect(deleteFile).toHaveBeenCalledWith(fileId);
  });
});
