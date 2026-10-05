/** A licence as dataset-service and vision-service send it: the name and link come from the server's table. */
export interface DataLicense {
  /** a listed licence's id (the Hugging Face Hub's spelling), or `other` */
  id: string;
  name: string;
  url?: string;
  /** false when the licence forbids commercial use; absent for `other`, whose terms Visin does not read */
  commercial?: boolean;
}

/** What a client declares: a listed id alone, or `other` with the name the publisher gives it. */
export type DeclaredLicense = { id: string; name?: undefined; url?: undefined } | { id: 'other'; name: string; url?: string };

/** What a suite's publisher says about the data it scores. Absent on a suite means unstated. */
export interface DataTerms {
  license?: DataLicense;
  sourceUrl?: string;
  credit?: string;
}

export const OTHER_LICENSE = 'other';
