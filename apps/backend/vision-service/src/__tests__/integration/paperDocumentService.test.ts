import { vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadGatewayError } from '@visin/backend-core';
import { deleteFile, getFileStream, putFile } from '../../clients/fileServiceClient';
import Paper from '../../models/Paper';
import PaperDocument from '../../models/PaperDocument';
import PaperPage from '../../models/PaperPage';
import {
  documentView,
  forgetPaperDocument,
  indexPaper,
  readPaperPages,
  requestIndex,
  searchPaperText
} from '../../services/paperDocumentService';
import { fetchPdf } from '../../services/paperPdfFetch';
import { pdfWithPages } from '../fixtures/pdf';

const pdfText = vi.hoisted(() => ({ pages: undefined as string[] | undefined }));
vi.mock('unpdf', async () => {
  const actual = await vi.importActual<typeof import('unpdf')>('unpdf');
  return {
    ...actual,
    // A test may hand the service pages of its own, to reach limits a real PDF would take a very large file to hit.
    extractText: vi.fn(async (...args: Parameters<typeof actual.extractText>) =>
      pdfText.pages ? { totalPages: pdfText.pages.length, text: pdfText.pages } : actual.extractText(...args)
    )
  };
});
vi.mock('../../services/paperPdfFetch', () => ({ fetchPdf: vi.fn() }));
vi.mock('../../clients/fileServiceClient', async () => ({
  ...(await vi.importActual<object>('../../clients/fileServiceClient')),
  putFile: vi.fn(),
  getFileStream: vi.fn(),
  deleteFile: vi.fn(async () => true)
}));

const OWNER = '000000000000000000000001';

/** The document service on its own: claiming a read, limits, replacing a stored copy, and what a search quotes. */
describe('the paper document service, with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await PaperDocument.syncIndexes();
    await PaperPage.syncIndexes();
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
  beforeEach(async () => {
    pdfText.pages = undefined;
    vi.mocked(fetchPdf)
      .mockReset()
      .mockResolvedValue({ bytes: pdfWithPages(['Alpha beta']), finalUrl: 'https://p.example.test/a.pdf' });
    vi.mocked(putFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(getFileStream).mockReset();
    vi.mocked(deleteFile).mockClear();
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  const paper = (fields: Record<string, unknown> = {}) =>
    Paper.create({
      title: 'Fusion',
      authors: [{ name: 'Ann' }],
      pdfUrl: 'https://p.example.test/a.pdf',
      owner: { kind: 'user', id: OWNER },
      createdBy: OWNER,
      visibility: 'public',
      ...fields
    });
  const ready = async (id: string, text: string[], extra: Record<string, unknown> = {}) => {
    await PaperDocument.create({
      paperId: id,
      sourceUrl: 'https://p.example.test/a.pdf',
      status: 'ready',
      fileId: `papers/${id}/x.pdf`,
      ...extra
    });
    await PaperPage.insertMany(text.map((body, i) => ({ paperId: id, n: i + 1, text: body })));
  };

  describe('claiming a read', () => {
    it('lets one of two reads at the same moment do the work', async () => {
      const p = await paper();
      await Promise.all([indexPaper(p), indexPaper(p)]);
      expect(fetchPdf).toHaveBeenCalledTimes(1);
      expect(await PaperDocument.countDocuments({ paperId: String(p._id) })).toBe(1);
    });

    it('leaves alone a read that started a moment ago, and takes over one that died', async () => {
      const p = await paper();
      await PaperDocument.create({
        paperId: String(p._id),
        sourceUrl: 'https://p.example.test/a.pdf',
        status: 'pending',
        startedAt: new Date()
      });
      await indexPaper(p);
      expect(fetchPdf).not.toHaveBeenCalled();

      await PaperDocument.updateOne(
        { paperId: String(p._id) },
        { $set: { startedAt: new Date(Date.now() - 10 * 60_000) } }
      );
      await indexPaper(p);
      expect(fetchPdf).toHaveBeenCalledTimes(1);
      expect((await PaperDocument.findOne({ paperId: String(p._id) }))!.status).toBe('ready');
    });

    it('passes on a failure that is not the race it expects', async () => {
      const p = await paper();
      const failure = vi.spyOn(PaperDocument, 'create').mockRejectedValueOnce(new Error('disk full') as never);
      await expect(indexPaper(p)).rejects.toThrow('disk full');
      failure.mockRestore();
    });

    it('records a failure of a background read on the log, never as an unhandled error', async () => {
      const p = await paper();
      const failure = vi.spyOn(PaperDocument, 'findOne').mockRejectedValueOnce(new Error('db down') as never);
      requestIndex(p);
      await new Promise((resolve) => setTimeout(resolve, 20));
      failure.mockRestore();
      expect(fetchPdf).not.toHaveBeenCalled();
    });
  });

  it('forgets the text and the stored PDF of a paper that no longer has an address', async () => {
    const p = await paper();
    await indexPaper(p);
    const stored = (await PaperDocument.findOne({ paperId: String(p._id) }))!.fileId!;
    p.pdfUrl = undefined;

    await indexPaper(p);

    expect(await PaperDocument.countDocuments()).toBe(0);
    expect(await PaperPage.countDocuments()).toBe(0);
    expect(deleteFile).toHaveBeenCalledWith(stored);
    expect(await documentView(p)).toEqual({ status: 'none', viewable: false });
  });

  it('keeps the first copy when a second read fails, and replaces it when the file changed', async () => {
    const p = await paper();
    await indexPaper(p);
    const first = (await PaperDocument.findOne({ paperId: String(p._id) }))!.fileId!;

    vi.mocked(fetchPdf).mockResolvedValue({ bytes: pdfWithPages(['Gamma delta']), finalUrl: 'x' });
    await indexPaper(p, { force: true });
    const second = (await PaperDocument.findOne({ paperId: String(p._id) }))!.fileId!;
    expect(second).not.toBe(first);
    expect(deleteFile).toHaveBeenCalledWith(first);
    expect((await PaperPage.findOne({ paperId: String(p._id), n: 1 }))!.text).toContain('Gamma');

    vi.mocked(fetchPdf).mockRejectedValue(new BadGatewayError("The PDF's server answered 404"));
    await indexPaper(p, { force: true });
    const failed = (await PaperDocument.findOne({ paperId: String(p._id) }))!;
    // A refusal from the publisher is worth saying; the text read earlier stays until a read succeeds.
    expect(failed).toMatchObject({ status: 'failed', error: "The PDF's server answered 404" });
    expect(await PaperPage.countDocuments({ paperId: String(p._id) })).toBe(1);
  });

  it('stops at its limits and says the later pages are missing', async () => {
    const p = await paper();
    pdfText.pages = ['a'.repeat(7_000_000), 'b'.repeat(7_000_000), 'c'];
    await indexPaper(p);

    expect(await documentView(p)).toMatchObject({ status: 'ready', truncated: true, pageCount: 3 });
    expect(await PaperPage.countDocuments({ paperId: String(p._id) })).toBe(1);
  });

  it('does not take a changed address for what is stored', async () => {
    const p = await paper();
    await indexPaper(p);
    p.pdfUrl = 'https://p.example.test/other.pdf';
    expect(await documentView(p)).toEqual({ status: 'pending', viewable: false });
  });

  it('shows an unread paper with an address as waiting, and a failed read with its reason', async () => {
    const p = await paper();
    expect(await documentView(p)).toEqual({ status: 'pending', viewable: false });
    await PaperDocument.create({
      paperId: String(p._id),
      sourceUrl: 'https://p.example.test/a.pdf',
      status: 'failed',
      error: 'No'
    });
    expect(await documentView(p)).toEqual({ status: 'failed', viewable: false, error: 'No' });
  });

  describe('searching', () => {
    it('quotes one passage for matches close together and up to three for matches far apart', async () => {
      const p = await paper();
      const filler = (n: number) => ' lorem'.repeat(n);
      await ready(
        String(p._id),
        [`rate rate rate${filler(10)}`, `rate${filler(200)} rate${filler(200)} rate${filler(200)} rate${filler(200)}`],
        { pageCount: 2 }
      );

      const { hits } = await searchPaperText(p, 'rate');
      const close = hits.find((hit) => hit.page === 1)!;
      const far = hits.find((hit) => hit.page === 2)!;
      expect(close.snippets).toHaveLength(1);
      expect(far.snippets).toHaveLength(2);
      expect(far.snippets[0].startsWith('…')).toBe(false);
      expect(far.snippets[1].startsWith('…')).toBe(true);
    });

    it('refuses a query with nothing to look for in it, and a paper not read', async () => {
      const p = await paper();
      await expect(searchPaperText(p, 'xx')).rejects.toThrow('has not been read');
      await ready(String(p._id), ['text']);
      await expect(searchPaperText(p, '?!')).rejects.toThrow('Search for a word');
    });

    it('prefers a page with the whole phrase, and reports the page count even when the record lacks it', async () => {
      const p = await paper();
      await ready(String(p._id), ['mean text IoU', 'mean IoU 0.7']);
      const { hits, pageCount } = await searchPaperText(p, 'mean IoU');
      expect(hits[0].page).toBe(2);
      expect(pageCount).toBe(2);
    });
  });

  describe('reading pages', () => {
    it('cuts a page only when that page alone is larger than a whole read, and says so', async () => {
      const p = await paper();
      await ready(String(p._id), ['x'.repeat(30_000), 'second'], { pageCount: 2 });
      const read = await readPaperPages(p, 1, 2);
      expect(read.pages).toHaveLength(1);
      expect(read.pages[0]).toMatchObject({ page: 1, cut: true });
      expect(read.pages[0].text.length).toBe(18_000);
      expect(read.next).toBe(2);
    });

    it('does not say where to continue past the end of the paper, whatever the record says of its length', async () => {
      const p = await paper();
      await ready(String(p._id), ['one', 'two']);
      const read = await readPaperPages(p, 1, 9);
      expect(read.pages.map((page) => page.page)).toEqual([1, 2]);
      expect(read.pageCount).toBe(2);
      expect(read).not.toHaveProperty('next');
    });

    it('is refused for a paper not read', async () => {
      const p = await paper();
      await expect(readPaperPages(p, 1, 1)).rejects.toThrow('has not been read');
    });
  });

  it('forgets nothing for a paper that was never read', async () => {
    await expect(forgetPaperDocument('000000000000000000000009')).resolves.toBeUndefined();
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
