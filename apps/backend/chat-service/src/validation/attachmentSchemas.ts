import { z } from 'zod';

/** Most files one message carries, and the most one file may be: chat is for sharing a result, not for storing data. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 ** 2;

/** A file name as the person's computer has it: shown back, never used as a path. */
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  // eslint-disable-next-line no-control-regex
  .refine((name) => !/[\u0000-\u001f\u007f/\\]/.test(name), 'A file name cannot hold a slash or a control character');

/** What the browser says it is about to upload, before any URL is minted. */
export const attachmentTicketSchema = z
  .object({
    name: fileName,
    mime: z.string().trim().min(1).max(100),
    size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES)
  })
  .strict();

/** An upload that finished, as the message names it. Its size and type are checked again against the stored file. */
export const attachmentRefSchema = z
  .object({
    fileId: z.string().min(1).max(300),
    name: fileName,
    mime: z.string().trim().min(1).max(100)
  })
  .strict();

export const attachmentUrlsSchema = z
  .object({ fileIds: z.array(z.string().min(1).max(300)).min(1).max(50) })
  .strict();
