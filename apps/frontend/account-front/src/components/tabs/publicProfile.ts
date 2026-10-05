export const MAX_BIO = 280;
export const MAX_LINKS = 8;

export interface PublicProfileValues {
  handle: string;
  bio: string;
  /** One entry per link box, as typed (blank ones included): an address, a domain, or a shorthand like `github:name`. */
  links: string[];
  profilePublic: boolean;
  showActivity: boolean;
}

/** What was typed in the link boxes: trimmed, with the blank ones left out. */
export const cleanLinks = (entries: string[]): string[] => entries.map((entry) => entry.trim()).filter(Boolean);
