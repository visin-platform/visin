import { z } from 'zod';

/**
 * What a person may type in a profile's links box. A full https address is kept as it is. A shorthand
 * (`github:ann-lee`, `orcid:0000-0002-1825-0097`) is turned into the platform's address, and a bare domain
 * (`ann.example.com`) gets `https://`. Only addresses are stored, so what is shown and what strangers follow is
 * always a plain https URL; the app recognises a platform by its host when it draws the page.
 */

/** A handle on most platforms: letters, digits, dots, underscores and hyphens. */
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,58}[A-Za-z0-9])?$/;

interface Platform {
  /** What it may be typed as, before the colon. */
  names: string[];
  /** What the part after the colon must look like, and what it says if not. */
  pattern: RegExp;
  expects: string;
  url: (value: string) => string;
}

const handlePlatform = (names: string[], base: string, expects = 'a user name'): Platform => ({
  names,
  pattern: NAME,
  expects,
  url: (value) => `${base}${encodeURIComponent(value)}`
});

const PLATFORMS: Platform[] = [
  handlePlatform(['github', 'gh'], 'https://github.com/'),
  handlePlatform(['gitlab'], 'https://gitlab.com/'),
  handlePlatform(['linkedin', 'in'], 'https://www.linkedin.com/in/', 'the name in your LinkedIn address'),
  {
    names: ['orcid'],
    pattern: /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/,
    expects: 'an ORCID iD like 0000-0002-1825-0097',
    url: (value) => `https://orcid.org/${value}`
  },
  {
    names: ['scholar', 'googlescholar'],
    pattern: /^[A-Za-z0-9_-]{8,20}$/,
    expects: 'the user id in your Google Scholar address (…citations?user=ID)',
    url: (value) => `https://scholar.google.com/citations?user=${value}`
  },
  handlePlatform(['hf', 'huggingface'], 'https://huggingface.co/'),
  handlePlatform(['kaggle'], 'https://www.kaggle.com/'),
  handlePlatform(['x', 'twitter'], 'https://x.com/'),
  {
    names: ['bluesky', 'bsky'],
    pattern: /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/,
    expects: 'your Bluesky handle, like name.bsky.social',
    url: (value) => `https://bsky.app/profile/${value}`
  },
  {
    names: ['youtube', 'yt'],
    pattern: /^@?[A-Za-z0-9._-]{3,60}$/,
    expects: 'your channel handle, like @name',
    url: (value) => `https://www.youtube.com/@${encodeURIComponent(value.replace(/^@/, ''))}`
  },
  {
    names: ['researchgate', 'rg'],
    pattern: /^[A-Za-z0-9_-]{3,80}$/,
    expects: 'the name in your ResearchGate address, like Ann-Lee',
    url: (value) => `https://www.researchgate.net/profile/${value}`
  },
  {
    names: ['mastodon'],
    pattern: /^@?[A-Za-z0-9_]{1,30}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
    expects: 'your Mastodon address, like @name@mastodon.social',
    url: (value) => {
      const [name, host] = value.replace(/^@/, '').split('@');
      return `https://${host}/@${name}`;
    }
  }
];

const BY_NAME = new Map(PLATFORMS.flatMap((platform) => platform.names.map((name) => [name, platform] as const)));

export const SHORTHAND_NAMES: string[] = PLATFORMS.map((platform) => platform.names[0]);

export type ExpandedLink = { ok: true; url: string } | { ok: false; error: string };

const fail = (error: string): ExpandedLink => ({ ok: false, error });

/** `ann.example.com/papers`: a host with a dot, no scheme, no spaces. */
const BARE_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?:[/?#]\S*)?$/;

/** The https address a line of the links box stands for, or what is wrong with it. */
export function expandLink(input: string): ExpandedLink {
  const text = input.trim();
  if (!text) return fail('A link cannot be empty');

  const shorthand = /^([A-Za-z]+):(?!\/\/)(.+)$/.exec(text);
  if (shorthand) {
    const name = shorthand[1].toLowerCase();
    const platform = BY_NAME.get(name);
    if (!platform)
      return fail(`“${shorthand[1]}:” is not a shorthand Visin knows. Use a full https:// address instead`);
    const value = shorthand[2].trim();
    if (!platform.pattern.test(value)) return fail(`“${text}” is not ${platform.expects}`);
    return { ok: true, url: platform.url(value) };
  }

  if (/^https:\/\//i.test(text)) return { ok: true, url: text };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return fail('Links must start with https://');
  if (BARE_DOMAIN.test(text)) return { ok: true, url: `https://${text}` };
  return fail(`“${text}” is not a web address or a shorthand like github:name`);
}

/** The most links a profile page can show. */
export const MAX_PROFILE_LINKS = 8;

/**
 * The links box of a profile page (a person's, a group's), as it arrives: each line an address, a bare domain or a
 * shorthand, and as it is kept: only https addresses. A profile link is shown to strangers, so `javascript:` and its
 * kin never get in.
 */
export const profileLinksSchema = z
  .array(
    z
      .string()
      .trim()
      .max(300)
      .transform((link, ctx) => {
        const expanded = expandLink(link);
        if (!expanded.ok) {
          ctx.addIssue({ code: 'custom', message: expanded.error });
          return z.NEVER;
        }
        return expanded.url;
      })
      .pipe(
        z
          .string()
          .max(300)
          .url('Links must be web addresses')
          .refine((link) => link.startsWith('https://'), 'Links must start with https://')
      )
  )
  .max(MAX_PROFILE_LINKS)
  .describe(
    `Up to ${MAX_PROFILE_LINKS} links, stored as https addresses. Each may be written as an address, a bare domain (\`example.com\`), or a shorthand: ${SHORTHAND_NAMES.map((name) => `${name}:`).join(', ')}.`
  );
