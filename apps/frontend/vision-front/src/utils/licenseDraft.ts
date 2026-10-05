import { OTHER_LICENSE, type DataLicense, type DeclaredLicense } from '../types/license';

/** A licence being edited in a form: nothing chosen, a listed id, or `other` with the fields it needs. */
export interface LicenseDraft {
  /** '' means the publisher has not said */
  id: string;
  name: string;
  url: string;
}

export const EMPTY_LICENSE_DRAFT: LicenseDraft = { id: '', name: '', url: '' };

export const licenseDraftOf = (license: DataLicense | undefined): LicenseDraft =>
  license
    ? { id: license.id, name: license.id === OTHER_LICENSE ? license.name : '', url: license.id === OTHER_LICENSE ? (license.url ?? '') : '' }
    : EMPTY_LICENSE_DRAFT;

/** What the form says, or why it cannot be saved. Unstated is `null`, which takes a declaration back. */
export function declaredLicenseOf(draft: LicenseDraft): { license: DeclaredLicense | null } | { error: string } {
  if (!draft.id) return { license: null };
  if (draft.id !== OTHER_LICENSE) return { license: { id: draft.id } };
  const name = draft.name.trim();
  if (!name) return { error: 'Name the licence, or choose one from the list' };
  const url = draft.url.trim();
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { error: 'The licence link must start with http:// or https://' };
  return { license: { id: OTHER_LICENSE, name, ...(url ? { url } : {}) } };
}
