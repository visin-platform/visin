import type { OwnerRef } from '@visin/frontend-core';

/** What an account shows of itself: a person who hid their profile has only an id. */
export interface PaperUser {
  id: string;
  handle?: string;
  name?: string;
  picture?: string;
}

/** One name on a paper's author list, as the paper prints it. */
export interface PaperAuthor {
  name: string;
  /** Present when the name is linked to an account: `pending` until that person confirms. */
  status?: 'confirmed' | 'pending';
  user?: PaperUser;
}

export type PaperResultKind = 'project' | 'training' | 'leaderboard';

/** What a paper cites. When it is no longer public, `available` is false and only a manager still sees its `ref`. */
export interface PaperResult {
  kind: PaperResultKind;
  available: boolean;
  /** a project id, a run id, or `slug@version` for a leaderboard */
  ref?: string;
  name?: string;
  note?: string;
  project?: { id: string; name: string; slug?: string };
}

export interface PaperPermissions {
  read: boolean;
  contribute: boolean;
  manage: boolean;
  own: boolean;
}

export type PaperVisibility = 'private' | 'public';

interface PaperBase {
  id: string;
  title: string;
  abstract?: string;
  authors: PaperAuthor[];
  venue?: string;
  year?: number;
  arxivId?: string;
  doi?: string;
  tags: string[];
  owner: OwnerRef & { name?: string; handle?: string; picture?: string };
  visibility: PaperVisibility;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
  permissions?: PaperPermissions;
}

/** A paper as a list shows it. */
export interface PaperCard extends PaperBase {
  results: { cited: number; available: number };
}

/** A whole paper. */
export interface Paper extends PaperBase {
  url?: string;
  pdfUrl?: string;
  results: PaperResult[];
}

export interface PaperPage {
  papers: PaperCard[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PublicPapersQuery {
  search?: string;
  user?: string;
  project?: string;
  sort?: 'created' | 'year';
  page?: number;
  limit?: number;
}

/** A Visin result as the form sends it. */
export interface PaperResultInput {
  kind: PaperResultKind;
  ref: string;
  note?: string;
}

export interface PaperInput {
  title: string;
  abstract?: string | null;
  authors: { name: string; userId?: string }[];
  venue?: string | null;
  year?: number | null;
  arxivId?: string | null;
  doi?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  tags: string[];
  results: PaperResultInput[];
  visibility?: PaperVisibility;
}

export interface CreatePaperInput extends Omit<PaperInput, 'abstract' | 'venue' | 'year' | 'arxivId' | 'doi' | 'url' | 'pdfUrl'> {
  abstract?: string;
  venue?: string;
  year?: number;
  arxivId?: string;
  doi?: string;
  url?: string;
  pdfUrl?: string;
  owner?: OwnerRef;
}

/** A person with a public page, as the author picker lists them. */
export interface PersonResult {
  id: string;
  handle: string;
  name: string;
  picture?: string;
}
