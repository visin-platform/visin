import type { Request, Response } from 'express';
import { BadRequestError, NotFoundError } from '@visin/backend-core';
import { requireUserCredential, tokenProjectId } from '../middleware/projectTokenContext';
import { documentView, indexPaper, openPaperPdf, readPaperPages, removeUploadedPdf, requestIndex, searchPaperText, uploadPaperPdf } from '../services/paperDocumentService';
import { getPaper, listReadablePapers, readablePaper } from '../services/paperService';
import type { PaperListQuery, PaperPagesQuery, PaperSearchQuery } from '../validation/paperSchemas';

/** Where the paper's PDF stands: being read, ready to show and search, or why it could not be read. */
export const getPaperDocument = async (req: Request, res: Response): Promise<void> => {
  const paper = await readablePaper(String(req.params.id), req.user?.id);
  const state = await documentView(paper);
  // A paper whose owner gave an address but was never read (made before this existed) is read the first time it is opened.
  if (state.status === 'pending') requestIndex(paper);
  res.json({ success: true, data: state });
};

/** The cached PDF, for the page to show in place. Only for someone who may read the paper. */
export const streamPaperPdf = async (req: Request, res: Response): Promise<void> => {
  const paper = await readablePaper(String(req.params.id), req.user?.id);
  const { stream, size } = await openPaperPdf(paper);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="paper.pdf"',
    // A draft is not for a shared cache.
    'Cache-Control': 'private, max-age=300',
    ...(size ? { 'Content-Length': String(size) } : {})
  });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
};

/** The owner asks for the PDF to be read again (a corrected address, a replaced file at the same address). */
export const refreshPaperDocument = async (req: Request, res: Response): Promise<void> => {
  const paper = await readablePaper(String(req.params.id), req.user!.id, 'manage');
  void indexPaper(paper, { force: true }).catch(() => undefined);
  res.status(202).json({ success: true, data: { status: 'pending', viewable: false } });
};

/** The owner's own PDF file, as the request body, in place of an address to read it from. */
export const uploadPdf = async (req: Request, res: Response): Promise<void> => {
  requireUserCredential();
  const paper = await readablePaper(String(req.params.id), req.user!.id, 'manage');
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new BadRequestError('Send the PDF file as the request body');
  res.status(201).json({ success: true, data: await uploadPaperPdf(paper, req.body) });
};

/** Takes the uploaded file away; the paper goes back to its PDF address, if it has one. */
export const deleteUploadedPdf = async (req: Request, res: Response): Promise<void> => {
  requireUserCredential();
  await removeUploadedPdf(await readablePaper(String(req.params.id), req.user!.id, 'manage'));
  res.json({ success: true, message: 'Uploaded PDF removed' });
};

/**
 * What an assistant needs to talk about a paper: who wrote it, the results it cites on Visin (as the page shows them),
 * and whether its text can be searched. A key limited to one project reads no paper: papers are not part of a project.
 */
export const getPaperForAssistant = async (req: Request, res: Response): Promise<void> => {
  if (tokenProjectId()) throw new NotFoundError('Paper not found');
  const id = String(req.params.id);
  const [paper, view] = await Promise.all([readablePaper(id, req.user?.id), getPaper(id, req.user?.id)]);
  res.json({ success: true, data: { paper: view, document: await documentView(paper) } });
};

export const searchPaper = async (req: Request, res: Response): Promise<void> => {
  if (tokenProjectId()) throw new NotFoundError('Paper not found');
  const paper = await readablePaper(String(req.params.id), req.user?.id);
  const { q, limit } = req.query as unknown as PaperSearchQuery;
  res.json({ success: true, data: { query: q, ...(await searchPaperText(paper, q, limit)) } });
};

export const readPaper = async (req: Request, res: Response): Promise<void> => {
  if (tokenProjectId()) throw new NotFoundError('Paper not found');
  const paper = await readablePaper(String(req.params.id), req.user?.id);
  const { from, to } = req.query as unknown as PaperPagesQuery;
  res.json({ success: true, data: await readPaperPages(paper, from, to ?? from) });
};

/** The papers the person can read, found by words: how an assistant finds a paper it was not handed. */
export const listPapersForAssistant = async (req: Request, res: Response): Promise<void> => {
  // Papers are not part of a project, so a key limited to one project finds none.
  if (tokenProjectId()) {
    res.json({ success: true, data: { papers: [] } });
    return;
  }
  res.json({ success: true, data: { papers: await listReadablePapers(req.user?.id, req.query as unknown as PaperListQuery) } });
};
