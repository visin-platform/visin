/** Text as a pattern that matches only itself, for a search typed by a person. */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
