/** A name on the list, and the account it is linked to, if any. `person.handle` is empty for a hidden profile. */
export interface AuthorDraft {
  key: string;
  name: string;
  person?: { id: string; handle: string; name: string; picture?: string };
  /** where the link stands, for an author already saved: only the person it names can confirm it */
  status?: 'confirmed' | 'pending';
}

let counter = 0;
export const newAuthorDraft = (fields: Partial<AuthorDraft> = {}): AuthorDraft => ({ key: `author-${++counter}`, name: '', ...fields });
