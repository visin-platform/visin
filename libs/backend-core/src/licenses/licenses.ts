import { z } from '@visin/backend-core';

/**
 * The licences the data behind a dataset or a suite can be declared to carry. Ids are the Hugging Face Hub's own
 * spellings, so a Hub card's licence can be taken over as it is. Visin never decides what a licence allows: this is
 * the publisher's declaration, shown beside the data, which Visin does not hold.
 */
export interface LicenseInfo {
  name: string;
  url: string;
  /** false when the licence forbids commercial use, so a card can say so without a reader opening the text */
  commercial: boolean;
}

const cc = (code: string, version: string, name: string, commercial = true): LicenseInfo => ({
  name,
  url: `https://creativecommons.org/licenses/${code}/${version}/`,
  commercial
});

export const LICENSES = {
  'cc0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', commercial: true },
  'cc-by-4.0': cc('by', '4.0', 'CC BY 4.0'),
  'cc-by-sa-4.0': cc('by-sa', '4.0', 'CC BY-SA 4.0'),
  'cc-by-nd-4.0': cc('by-nd', '4.0', 'CC BY-ND 4.0'),
  'cc-by-nc-4.0': cc('by-nc', '4.0', 'CC BY-NC 4.0', false),
  'cc-by-nc-sa-4.0': cc('by-nc-sa', '4.0', 'CC BY-NC-SA 4.0', false),
  'cc-by-nc-nd-4.0': cc('by-nc-nd', '4.0', 'CC BY-NC-ND 4.0', false),
  'cc-by-3.0': cc('by', '3.0', 'CC BY 3.0'),
  'cc-by-sa-3.0': cc('by-sa', '3.0', 'CC BY-SA 3.0'),
  'odc-by': { name: 'ODC-By 1.0', url: 'https://opendatacommons.org/licenses/by/1-0/', commercial: true },
  odbl: { name: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', commercial: true },
  pddl: { name: 'PDDL 1.0', url: 'https://opendatacommons.org/licenses/pddl/1-0/', commercial: true },
  'cdla-permissive-2.0': { name: 'CDLA Permissive 2.0', url: 'https://cdla.dev/permissive-2-0/', commercial: true },
  'cdla-sharing-1.0': { name: 'CDLA Sharing 1.0', url: 'https://cdla.dev/sharing-1-0/', commercial: true },
  'apache-2.0': { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', commercial: true },
  mit: { name: 'MIT', url: 'https://opensource.org/license/mit', commercial: true },
  'bsd-2-clause': { name: 'BSD 2-Clause', url: 'https://opensource.org/license/bsd-2-clause', commercial: true },
  'bsd-3-clause': { name: 'BSD 3-Clause', url: 'https://opensource.org/license/bsd-3-clause', commercial: true },
  'gpl-3.0': { name: 'GPL 3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html', commercial: true }
} as const satisfies Record<string, LicenseInfo>;

export type KnownLicenseId = keyof typeof LICENSES;
export const KNOWN_LICENSE_IDS = Object.keys(LICENSES) as [KnownLicenseId, ...KnownLicenseId[]];

/** `other` is any licence not listed, named by the publisher, with a link to its terms when there is one. */
export const OTHER_LICENSE = 'other' as const;

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Expected an http(s) address');

/** A licence as a client declares it: a listed id alone, or `other` with the name the publisher gives it. */
export const licenseSchema = z.union([
  z.strictObject({ id: z.enum(KNOWN_LICENSE_IDS) }),
  z.strictObject({ id: z.literal(OTHER_LICENSE), name: z.string().trim().min(1, 'Name the licence').max(100), url: httpUrl.optional() })
]);
export type DeclaredLicense = z.infer<typeof licenseSchema>;

export interface LicenseView {
  id: string;
  name: string;
  url?: string;
  /** absent for `other`: Visin does not read terms it does not know */
  commercial?: boolean;
}

/** What a client sees: a listed licence's name and link come from the table, so they cannot drift from the id. */
export function licenseView(license: DeclaredLicense | undefined): LicenseView | undefined {
  if (!license) return undefined;
  if (license.id === OTHER_LICENSE) return { id: license.id, name: license.name, ...(license.url ? { url: license.url } : {}) };
  return { id: license.id, ...LICENSES[license.id] };
}

/** The choices a form offers, in the order a person looks for them. */
export const licenseChoices = (): (LicenseView & { id: string })[] => [
  ...KNOWN_LICENSE_IDS.map((id) => ({ id, ...LICENSES[id] })),
  { id: OTHER_LICENSE, name: 'Other' }
];
