export const MAX_BIO = 280;
export const MAX_LINKS = 5;

export interface PublicProfileValues {
  handle: string;
  bio: string;
  /** One address per line, as typed. */
  linksText: string;
  profilePublic: boolean;
  showActivity: boolean;
}

/** The addresses typed in the links box: one per line, blanks ignored. */
export const parseLinks = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
