import { resourceOwnerSchema, visibilitySchema, z } from '@visin/backend-core';
import { PAPER_RESULT_KINDS } from '../models/Paper';
import { parseArxivId, parseDoi, parseHttpUrl } from '../services/paperIdentifiers';

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be an account or project id')
  .transform((id) => id.toLowerCase());

/** An identifier or address in any of its usual spellings, stored in one. */
const normalised = (what: string, max: number, parse: (input: string) => string | undefined) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value, ctx) => {
      const parsed = parse(value);
      if (parsed === undefined) {
        ctx.addIssue({ code: 'custom', message: `Not ${what}` });
        return z.NEVER;
      }
      return parsed;
    });

const arxivId = normalised('an arXiv id', 200, parseArxivId);
const doi = normalised('a DOI', 200, parseDoi);
const link = normalised('an http(s) address', 500, parseHttpUrl);
const text = (max: number) => z.string().trim().max(max);

const author = z.object({
  /** the name as the paper prints it */
  name: z.string().trim().min(1, 'An author needs a name').max(120),
  /** the Visin account it is, which that person still has to confirm */
  userId: objectId.optional()
});

const authors = z
  .array(author)
  .min(1, 'A paper needs at least one author')
  .max(50)
  .refine((list) => {
    const linked = list.flatMap((entry) => (entry.userId ? [entry.userId] : []));
    return new Set(linked).size === linked.length;
  }, 'An account can be linked to one author only');

const result = z.object({
  kind: z.enum(PAPER_RESULT_KINDS),
  /** a project's id or slug, a run's id, or `slug@version` for a leaderboard */
  ref: z.string().trim().min(1).max(200),
  /** where in the paper it is used */
  note: text(200).optional()
});

const results = z.array(result).max(30);

const tags = z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10);

const shape = {
  title: z.string().trim().min(1, 'A title is required').max(300),
  abstract: text(5000),
  authors,
  venue: text(200),
  year: z.number().int().min(1900).max(2100),
  arxivId,
  doi,
  url: link,
  pdfUrl: link,
  tags,
  results
};

export const createPaperBodySchema = z.object({
  title: shape.title,
  abstract: shape.abstract.optional(),
  authors: shape.authors,
  venue: shape.venue.optional(),
  year: shape.year.optional(),
  arxivId: shape.arxivId.optional(),
  doi: shape.doi.optional(),
  url: shape.url.optional(),
  pdfUrl: shape.pdfUrl.optional(),
  tags: shape.tags.default([]),
  results: shape.results.default([]),
  /** the caller (the default), or one of their groups */
  owner: resourceOwnerSchema.optional(),
  visibility: visibilitySchema.default('private')
});
export type CreatePaperBody = z.infer<typeof createPaperBodySchema>;

/** What is sent replaces what was there; `null` clears an optional field. */
export const updatePaperBodySchema = z.object({
  title: shape.title.optional(),
  abstract: shape.abstract.nullable().optional(),
  authors: shape.authors.optional(),
  venue: shape.venue.nullable().optional(),
  year: shape.year.nullable().optional(),
  arxivId: shape.arxivId.nullable().optional(),
  doi: shape.doi.nullable().optional(),
  url: shape.url.nullable().optional(),
  pdfUrl: shape.pdfUrl.nullable().optional(),
  tags: shape.tags.optional(),
  results: shape.results.optional(),
  visibility: visibilitySchema.optional()
});
export type UpdatePaperBody = z.infer<typeof updatePaperBodySchema>;

/** The public catalogue of papers: a search, one person's or one project's, a page. */
export const publicPapersQuerySchema = z.object({
  /** words in the title, abstract, authors, tags or venue; or an arXiv id or DOI */
  search: z.string().trim().max(200).optional(),
  /** a person's id: papers that person is a confirmed author of */
  user: objectId.optional(),
  /** a project's id: papers citing a result in it */
  project: objectId.optional(),
  /** `created`: newest added first. `year`: newest publication year first. */
  sort: z.enum(['created', 'year']).default('created'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12)
});
export type PublicPapersQuery = z.infer<typeof publicPapersQuerySchema>;

/** What the caller's own papers can be asked: their live ones, or the trash. */
export const myPapersQuerySchema = z.object({
  scope: z.enum(['mine', 'trash']).default('mine')
});
export type MyPapersQuery = z.infer<typeof myPapersQuerySchema>;

/** Whether a person stands behind the link between an author name on a paper and their account. */
export const authorshipBodySchema = z.object({ linked: z.boolean() });
