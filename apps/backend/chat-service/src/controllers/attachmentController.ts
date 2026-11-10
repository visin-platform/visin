import type { Request, Response } from 'express';
import { downloadUrls, reserveUpload } from '../services/attachments';
import { paramId } from '../utils/request';
import { attachmentTicketSchema, attachmentUrlsSchema } from '../validation/attachmentSchemas';
import { parsed } from '../validation/parse';

/** POST /conversations/:id/attachments: where to upload one file. The file is named in a message once it is there. */
export async function ticket(req: Request, res: Response): Promise<void> {
  res.status(201).json({ success: true, data: await reserveUpload(req, paramId(req), parsed(attachmentTicketSchema, req.body)) });
}

/** POST /conversations/:id/attachment-urls: signed addresses to read files of messages this person can see. */
export async function urls(req: Request, res: Response): Promise<void> {
  const { fileIds } = parsed(attachmentUrlsSchema, req.body);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await downloadUrls(req, paramId(req), fileIds) });
}
