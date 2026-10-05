import { licenseView, type LicenseView } from '@visin/backend-core';
import type { SuiteDataTerms } from '../models/Suite';

export interface DataTermsView {
  license?: LicenseView;
  sourceUrl?: string;
  credit?: string;
}

/** The declaration as a reader sees it, key by key: the same for a signed-in owner and an anonymous visitor. */
export const dataTermsView = (terms: SuiteDataTerms): DataTermsView => ({
  ...(terms.license ? { license: licenseView(terms.license) } : {}),
  ...(terms.sourceUrl ? { sourceUrl: terms.sourceUrl } : {}),
  ...(terms.credit ? { credit: terms.credit } : {})
});
