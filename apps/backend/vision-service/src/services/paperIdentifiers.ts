/**
 * The addresses a paper is known by, reduced to one spelling each, so two people who paste the same paper in
 * different forms (`arXiv:2401.01234v2`, the abs page, the pdf) end up with the same stored value, and a search for
 * any of them finds it.
 */

const NEW_ARXIV = /^\d{4}\.\d{4,5}$/;
const OLD_ARXIV = /^[a-z-]+(\.[a-z]{2})?\/\d{7}$/;

/** `2401.01234` from an id, `arXiv:` form or arxiv.org page address, without a version; undefined if it is none of them. */
export function parseArxivId(input: string): string | undefined {
  const id = (input.trim().split(/[?#]/)[0] ?? '')
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i, '')
    .replace(/\.pdf$/i, '')
    .replace(/^arxiv:\s*/i, '')
    .replace(/v\d+$/i, '')
    .toLowerCase();
  return NEW_ARXIV.test(id) || OLD_ARXIV.test(id) ? id : undefined;
}

const DOI = /^10\.\d{4,9}\/\S+$/;

/** A lowercase DOI from a bare one, a `doi:` form or a doi.org address; undefined if it is none of them. */
export function parseDoi(input: string): string | undefined {
  let doi = input.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  try {
    doi = decodeURIComponent(doi);
  } catch {
    return undefined;
  }
  doi = doi.toLowerCase();
  return DOI.test(doi) ? doi : undefined;
}

/** The address, when it is an http(s) one that carries no password; undefined otherwise. */
export function parseHttpUrl(input: string): string | undefined {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export const arxivLink = (id: string): string => `https://arxiv.org/abs/${id}`;
export const doiLink = (doi: string): string => `https://doi.org/${doi}`;
