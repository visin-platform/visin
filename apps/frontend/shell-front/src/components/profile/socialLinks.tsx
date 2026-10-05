import type { ReactNode } from 'react';
import { GitHub, Language, LinkedIn, School, X, YouTube } from '@mui/icons-material';
import { Monogram } from './Monogram';

export interface LinkInfo {
  /** What it is: the platform's name, or for a site of the person's own, its address. */
  label: string;
  /** Who, on a platform: the name at the end of the address. */
  detail?: string;
  icon: ReactNode;
}

interface Platform {
  label: string;
  icon: ReactNode;
  /** Which path segment names the person: the last one by default; none where the address has no such name. */
  detail?: (segments: string[]) => string | undefined;
}

const last = (segments: string[]) => segments[segments.length - 1];
const first = (segments: string[]) => segments[0];
const afterIn = (segments: string[]) => (segments[0] === 'in' ? segments[1] : last(segments));

/** The well-known platforms, by host (without `www.`). Anything else is the person's own site. */
const PLATFORMS: Record<string, Platform> = {
  'github.com': { label: 'GitHub', icon: <GitHub fontSize="small" />, detail: first },
  'gitlab.com': { label: 'GitLab', icon: <Monogram letters="GL" />, detail: first },
  'linkedin.com': { label: 'LinkedIn', icon: <LinkedIn fontSize="small" />, detail: afterIn },
  'orcid.org': { label: 'ORCID', icon: <Monogram letters="iD" />, detail: last },
  'scholar.google.com': { label: 'Google Scholar', icon: <School fontSize="small" /> },
  'huggingface.co': { label: 'Hugging Face', icon: <Monogram letters="HF" />, detail: first },
  'kaggle.com': { label: 'Kaggle', icon: <Monogram letters="K" />, detail: first },
  'x.com': { label: 'X', icon: <X fontSize="small" />, detail: first },
  'twitter.com': { label: 'X', icon: <X fontSize="small" />, detail: first },
  'bsky.app': { label: 'Bluesky', icon: <Monogram letters="Bs" />, detail: last },
  'youtube.com': { label: 'YouTube', icon: <YouTube fontSize="small" />, detail: first },
  'researchgate.net': { label: 'ResearchGate', icon: <Monogram letters="RG" />, detail: last },
  'semanticscholar.org': { label: 'Semantic Scholar', icon: <Monogram letters="S2" /> }
};

/** `example.com/path` for `https://example.com/path/`: what a site of the person's own says it is. */
const plainAddress = (url: URL): string => `${url.host}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/**
 * What a link on a profile is, for drawing it: a recognised platform gets its icon, its name and who it is, and any
 * other address is shown as a site of the person's own, by its address. Nothing here decides what is allowed (that is
 * the service's job, on save); it only reads the address.
 */
export function describeLink(link: string): LinkInfo {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { label: link, icon: <Language fontSize="small" /> };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const platform =
    PLATFORMS[host] ?? (host.startsWith('scholar.google.') ? PLATFORMS['scholar.google.com'] : undefined);
  if (!platform) return { label: plainAddress(url), icon: <Language fontSize="small" /> };

  const segments = url.pathname.split('/').filter(Boolean).map(decode);
  const detail = platform.detail?.(segments);
  return { label: platform.label, ...(detail ? { detail } : {}), icon: platform.icon };
}
