/**
 * The token in a link's `#…`. Mail and chat apps can encode it or run the
 * sentence's punctuation into it ("…#3fa9…c2)."), so the token is the run of
 * exactly 64 hex characters there rather than the whole fragment.
 */
export const tokenFromHash = (hash: string): string => {
  let text = hash;
  try {
    text = decodeURIComponent(hash);
  } catch {
    // A stray "%" that is not an escape: read the fragment as it is.
  }
  return /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i.exec(text)?.[0].toLowerCase() ?? '';
};
