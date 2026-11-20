import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestError, NotFoundError, logger } from '@visin/backend-core';
import { extractText, getDocumentProxy } from 'unpdf';
import { deleteFile, getFileStream, putFile } from '../clients/fileServiceClient';
import PaperDocument, { type IPaperDocument } from '../models/PaperDocument';
import PaperPage from '../models/PaperPage';
import type { IPaper } from '../models/Paper';
import { fetchPdf } from './paperPdfFetch';

/** Far past any paper; a document longer than this (a thesis, a book) is read to the limit, and says so. */
const MAX_PAGES = 1000;
/** The largest PDF an owner can upload: what is read from an address is held to the same size. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARS = 12_000_000;
/** A read that started this long ago and never finished is treated as dead, so the paper can be read again. */
const STALE_MS = 3 * 60_000;
/**
 * What one read hands back. Everything handed back sits in the analyst's context, and the tool framework clips a result
 * at 20,000 characters, so a read fills that budget with whole pages (four or five of a dense paper) rather than a fixed
 * few, and says where to continue. A single page is never cut unless it alone is larger than the budget.
 */
const READ_BUDGET_CHARS = 18_000;
const MAX_PAGES_ASKED = 20;
const MAX_HITS = 8;
const SNIPPET_CHARS = 320;

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})$/;

/** Where the paper's PDF is read from: the address its owner gave, else arXiv's own for an arXiv paper. */
export function pdfSourceOf(paper: Pick<IPaper, 'pdfUrl' | 'arxivId'>): string | null {
  if (paper.pdfUrl) return paper.pdfUrl;
  if (paper.arxivId && ARXIV_ID.test(paper.arxivId)) return `https://arxiv.org/pdf/${paper.arxivId}`;
  return null;
}

export interface PaperDocumentView {
  /** `none` when the paper has no PDF address to read from */
  status: 'none' | 'pending' | 'ready' | 'failed';
  pageCount?: number;
  truncated?: boolean;
  error?: string;
  /** the PDF can be shown here, from storage */
  viewable: boolean;
  /** the owner uploaded the file themselves, rather than giving an address to read it from */
  uploaded?: boolean;
}

const view = (doc: IPaperDocument | null, hasSource: boolean): PaperDocumentView => {
  if (!doc) return { status: hasSource ? 'pending' : 'none', viewable: false };
  return {
    status: doc.status,
    viewable: doc.status === 'ready' && Boolean(doc.fileId),
    ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
    ...(doc.truncated ? { truncated: true } : {}),
    ...(doc.uploaded ? { uploaded: true } : {}),
    ...(doc.error ? { error: doc.error } : {})
  };
};

/** Why a read failed, in words a reader can act on. Never the server's own message, which may name internals. */
const reasonFor = (error: unknown): string =>
  error instanceof BadRequestError || (error as { statusCode?: number }).statusCode
    ? ((error as Error).message || 'The PDF could not be read').slice(0, 200)
    : 'The PDF could not be read';

const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Reads the paper's PDF into storage and into searchable text. Safe to call twice at once: a read already under way
 * is left alone. A paper whose address changed is read again; `force` rereads regardless (the owner's "read again").
 */
export async function indexPaper(paper: IPaper, { force = false }: { force?: boolean } = {}): Promise<void> {
  const source = pdfSourceOf(paper);
  const paperId = String(paper._id);
  const existing = await PaperDocument.findOne({ paperId });
  // A file the owner uploaded is the paper's PDF: no address replaces it, and there is nothing to read again.
  if (existing?.uploaded) return;
  if (!source) {
    await forgetPaperDocument(paperId);
    return;
  }
  if (existing && !force && existing.sourceUrl === source) {
    if (existing.status === 'ready') return;
    if (existing.status === 'pending' && existing.startedAt && Date.now() - existing.startedAt.getTime() < STALE_MS)
      return;
  }
  const claimed = await PaperDocument.findOneAndUpdate(
    {
      paperId,
      $or: [{ status: { $ne: 'pending' } }, { startedAt: { $lt: new Date(Date.now() - STALE_MS) } }]
    },
    { $set: { sourceUrl: source, status: 'pending', startedAt: new Date() }, $unset: { error: 1 } },
    { upsert: false, new: true }
  );
  if (!claimed) {
    try {
      await PaperDocument.create({ paperId, sourceUrl: source, status: 'pending', startedAt: new Date() });
    } catch (error) {
      // Another request created it first: that one does the reading.
      if ((error as { code?: number }).code === 11000) return;
      throw error;
    }
  }
  try {
    const { bytes } = await fetchPdf(source);
    await storeDocument(paperId, bytes, await readPages(paperId, bytes));
  } catch (error) {
    logger.warn('Could not read a paper PDF', { paperId, error: (error as Error).message });
    // A file the owner uploaded while this read was under way stays as it is: the failure was not about it.
    await PaperDocument.updateOne(
      { paperId, uploaded: { $ne: true } },
      { $set: { status: 'failed', error: reasonFor(error) }, $unset: { startedAt: 1 } }
    );
  }
}

/** The text of each page, tidied, up to the limits; a longer document is read to the limit and says so. */
async function readPages(paperId: string, bytes: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: { paperId: string; n: number; text: string }[] = [];
  let chars = 0;
  let truncated = false;
  for (const [index, raw] of (text as string[]).entries()) {
    const cleaned = tidy(raw);
    if (pages.length >= MAX_PAGES || chars + cleaned.length > MAX_TEXT_CHARS) {
      truncated = true;
      break;
    }
    chars += cleaned.length;
    pages.push({ paperId, n: index + 1, text: cleaned });
  }
  return { pages, totalPages, truncated };
}

/**
 * Keeps a read PDF as the paper's document: the file in storage, its text by page. The old text goes only once the new
 * is read, so a failed second read leaves the first in place. `upload` is set for a file the owner uploaded, which
 * creates the document if there is none.
 */
async function storeDocument(
  paperId: string,
  bytes: Buffer,
  read: Awaited<ReturnType<typeof readPages>>,
  upload?: { sourceUrl: string }
): Promise<void> {
  const { pages, totalPages, truncated } = read;
  const fileId = `papers/${paperId}/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.pdf`;
  const before = await PaperDocument.findOne({ paperId }).select('fileId');
  await putFile(fileId, bytes, 'application/pdf');
  // The document is claimed before its text is touched: a read from an address that finishes after the owner uploaded
  // a file matches nothing here, and stops before it can replace that file's pages.
  const claimed = await PaperDocument.updateOne(
    upload ? { paperId } : { paperId, uploaded: { $ne: true } },
    {
      $set: {
        status: 'ready',
        fileId,
        size: bytes.length,
        pageCount: totalPages,
        truncated,
        indexedAt: new Date(),
        ...(upload ? { sourceUrl: upload.sourceUrl, uploaded: true } : {})
      },
      $unset: { error: 1, startedAt: 1 }
    },
    { upsert: Boolean(upload) }
  );
  if (!upload && claimed.matchedCount === 0) {
    // Not the uploaded file's name (that would be the same bytes), so nothing points at what was just stored.
    if (before?.fileId !== fileId) await deleteFile(fileId);
    return;
  }
  await PaperPage.deleteMany({ paperId });
  if (pages.length) await PaperPage.insertMany(pages, { ordered: true });
  if (before?.fileId && before.fileId !== fileId) await deleteFile(before.fileId);
}

/**
 * The owner's own file becomes the paper's PDF, in place of any address. Unlike a read from an address this answers
 * for itself: a file that is not a readable PDF is refused here before anything changes, so the paper keeps what it had.
 */
export async function uploadPaperPdf(paper: IPaper, bytes: Buffer): Promise<PaperDocumentView> {
  const paperId = String(paper._id);
  if (bytes.length === 0 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new BadRequestError('That file is not a PDF');
  }
  let read: Awaited<ReturnType<typeof readPages>>;
  try {
    read = await readPages(paperId, bytes);
  } catch (error) {
    logger.warn('Could not read an uploaded paper PDF', { paperId, error: (error as Error).message });
    throw new BadRequestError('That PDF could not be read');
  }
  const sourceUrl = `upload:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
  await storeDocument(paperId, bytes, read, { sourceUrl });
  return documentView(paper);
}

/** Drops the uploaded file; the paper goes back to its PDF address, or to none. */
export async function removeUploadedPdf(paper: IPaper): Promise<void> {
  const paperId = String(paper._id);
  const doc = await PaperDocument.findOne({ paperId });
  if (!doc?.uploaded) throw new NotFoundError('This paper has no uploaded PDF');
  if (paper.visibility === 'public' && !paper.arxivId && !paper.doi && !paper.url) {
    throw new BadRequestError('A public paper needs an arXiv id, a DOI or a link once its uploaded PDF is gone');
  }
  await forgetPaperDocument(paperId);
  requestIndex(paper);
}

/** Whether the paper's PDF is a file its owner uploaded. */
export const hasUploadedPdf = async (paperId: string): Promise<boolean> =>
  (await PaperDocument.exists({ paperId, uploaded: true, status: 'ready' })) !== null;

/** Starts reading in the background, for a paper just made or changed. A failure is recorded on the document. */
export function requestIndex(paper: IPaper): void {
  void indexPaper(paper).catch((error: Error) =>
    logger.warn('Paper indexing failed', { paperId: String(paper._id), error: error.message })
  );
}

export async function documentView(paper: IPaper): Promise<PaperDocumentView> {
  const doc = await PaperDocument.findOne({ paperId: String(paper._id) });
  const source = pdfSourceOf(paper);
  if (doc?.uploaded) return view(doc, true);
  // A PDF address that was changed after the last read is not what is stored.
  if (doc && source && doc.sourceUrl !== source) return { status: 'pending', viewable: false };
  return view(doc, Boolean(source));
}

/** The cached PDF as a stream, or 404 while it is not ready. */
export async function openPaperPdf(paper: IPaper): Promise<{ stream: Readable; size?: number }> {
  const doc = await PaperDocument.findOne({ paperId: String(paper._id) });
  if (!doc || doc.status !== 'ready' || !doc.fileId) throw new NotFoundError('This paper has no PDF stored yet');
  return { stream: await getFileStream(doc.fileId), size: doc.size };
}

const terms = (query: string): string[] =>
  [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}.%_-]+/u)
        .filter((term) => term.length >= 2)
    )
  ].slice(0, 8);

export interface PaperHit {
  page: number;
  score: number;
  snippets: string[];
}

/** The pages that mention the query, best first, each with a few quoted passages: what to read before quoting. */
export async function searchPaperText(
  paper: IPaper,
  query: string,
  limit = 5
): Promise<{ hits: PaperHit[]; pageCount: number }> {
  const doc = await PaperDocument.findOne({ paperId: String(paper._id), status: 'ready' });
  if (!doc) throw new NotFoundError('This paper has not been read yet');
  const pageDocs = await PaperPage.find({ paperId: String(paper._id) })
    .sort({ n: 1 })
    .lean();
  const wanted = terms(query);
  if (wanted.length === 0) throw new BadRequestError('Search for a word, a number or a phrase');
  const phrase = query.trim().toLowerCase();
  const hits: PaperHit[] = [];
  for (const page of pageDocs) {
    const lower = page.text.toLowerCase();
    let score = lower.includes(phrase) && wanted.length > 1 ? 5 : 0;
    const spots: number[] = [];
    for (const term of wanted) {
      let at = lower.indexOf(term);
      let count = 0;
      while (at !== -1 && count < 20) {
        if (count < 2) spots.push(at);
        count++;
        at = lower.indexOf(term, at + term.length);
      }
      if (count > 0) score += 1 + Math.min(count, 5) / 5;
    }
    if (score === 0) continue;
    const snippets: string[] = [];
    // Where the last quoted passage ended, so two matches close together are one passage, not two overlapping ones.
    let quotedTo = -1;
    for (const spot of spots.sort((a, b) => a - b)) {
      if (snippets.length >= 3) break;
      if (spot < quotedTo) continue;
      const start = Math.max(0, spot - SNIPPET_CHARS / 2);
      quotedTo = start + SNIPPET_CHARS;
      snippets.push(`${start > 0 ? '…' : ''}${page.text.slice(start, quotedTo).replace(/\s+/g, ' ')}…`);
    }
    hits.push({ page: page.n, score: Math.round(score * 10) / 10, snippets });
  }
  hits.sort((a, b) => b.score - a.score || a.page - b.page);
  return { hits: hits.slice(0, Math.min(limit, MAX_HITS)), pageCount: doc.pageCount ?? pageDocs.length };
}

/**
 * Whole pages from `from`, as many as fit the budget up to `to`. `next` says where to continue when the range was longer
 * than one read can carry; it is absent once the range (or the paper) ends.
 */
export async function readPaperPages(paper: IPaper, from: number, to: number) {
  const doc = await PaperDocument.findOne({ paperId: String(paper._id), status: 'ready' });
  if (!doc) throw new NotFoundError('This paper has not been read yet');
  if (to < from) throw new BadRequestError('The last page comes before the first');
  const last = Math.min(to, from + MAX_PAGES_ASKED - 1);
  const wanted = await PaperPage.find({ paperId: String(paper._id), n: { $gte: from, $lte: last } })
    .sort({ n: 1 })
    .lean();
  if (wanted.length === 0) throw new NotFoundError('That page is not in this paper');
  const pages: { page: number; text: string; cut?: boolean }[] = [];
  let used = 0;
  for (const page of wanted) {
    const room = READ_BUDGET_CHARS - used;
    if (pages.length > 0 && page.text.length > room) break;
    const text = page.text.length > READ_BUDGET_CHARS ? page.text.slice(0, READ_BUDGET_CHARS) : page.text;
    pages.push({ page: page.n, text, ...(text.length < page.text.length ? { cut: true } : {}) });
    used += text.length;
  }
  const lastRead = pages[pages.length - 1].page;
  const pageCount = doc.pageCount ?? lastRead;
  const next = lastRead < Math.min(to, pageCount) ? lastRead + 1 : undefined;
  return { pages, pageCount, ...(next ? { next } : {}) };
}

/** Removes what the paper cached, for a paper gone for good. */
export async function forgetPaperDocument(paperId: string): Promise<void> {
  await PaperPage.deleteMany({ paperId });
  const doc = await PaperDocument.findOneAndDelete({ paperId }).select('fileId');
  if (doc?.fileId) await deleteFile(doc.fileId);
}
