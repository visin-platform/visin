/**
 * Whether the shell has been deployed again since this page loaded.
 *
 * The build names its entry scripts by content hash, so a new deploy serves a page whose module scripts are not the
 * ones running here. Comparing them needs no version file and no change to the build. It says nothing about the
 * remotes (vision, label, account, chat), which deploy on their own and are loaded on demand.
 */
const path = (src: string): string => {
  try {
    return new URL(src, window.location.origin).pathname;
  } catch {
    return src;
  }
};

/** The module scripts a page's HTML loads, by path. */
export function moduleScripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    return src && /\btype=["']module["']/i.test(tag) ? [path(src)] : [];
  });
}

/** True only when the server's page names a script this page is not running; any failure to find out says no. */
export async function newVersionDeployed(): Promise<boolean> {
  try {
    const response = await fetch('/', { cache: 'no-store', headers: { accept: 'text/html' } });
    if (!response.ok) return false;
    const deployed = moduleScripts(await response.text());
    if (!deployed.length) return false;
    const running = new Set(
      [...document.scripts].flatMap((script) => {
        const src = script.getAttribute('src');
        return src ? [path(src)] : [];
      })
    );
    return deployed.some((script) => !running.has(script));
  } catch {
    return false;
  }
}
