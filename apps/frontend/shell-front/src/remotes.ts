import { lazy, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/runtime';
import { VISIN_REMOTE_ENTRY, VISIN_REMOTE_MODULE, VISIN_UPLOADS_MODULE } from '@visin/frontend-core/federation';
import { getGlobalConfig } from './config/ConfigProvider';
import { APPS, SHELL_APPS, type ShellApp } from './apps';

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

let registered = false;

/**
 * Tells the federation runtime where each configured app lives. Done on first
 * use rather than at build time because the addresses are deployment config,
 * read from config.json — the same image serves every environment.
 */
function ensureRemotesRegistered(): void {
  if (registered) {
    return;
  }
  const config = getGlobalConfig();
  registerRemotes(
    SHELL_APPS.flatMap((app) => {
      const baseUrl = config[APPS[app].urlKey];
      return baseUrl
        ? [{ name: app, entry: `${stripTrailingSlash(baseUrl)}/${VISIN_REMOTE_ENTRY}`, type: 'module' }]
        : [];
    })
  );
  registered = true;
}

const components = new Map<ShellApp, LazyExoticComponent<ComponentType>>();

/** Apps whose code has loaded in this tab — whatever they left running is still running. */
const loaded = new Set<ShellApp>();
const loadedListeners = new Set<() => void>();
const markLoaded = (app: ShellApp): void => {
  if (loaded.has(app)) return;
  loaded.add(app);
  loadedListeners.forEach((listener) => listener());
};

/** Whether an app has been opened in this tab yet. */
export function useRemoteLoaded(app: ShellApp): boolean {
  return useSyncExternalStore(
    (listener) => {
      loadedListeners.add(listener);
      return () => loadedListeners.delete(listener);
    },
    () => loaded.has(app)
  );
}

let uploads: LazyExoticComponent<ComponentType> | undefined;

/**
 * Vision's upload corner (`vision/Uploads`), to render on every page: a zip
 * upload started in Vision keeps going while the user is on the home page or in
 * Labeling. Only asked for once Vision itself has loaded — an upload can only
 * start there, and loading it from the same remote is what makes it read the
 * store Vision's pages write to.
 */
export function remoteUploads(): LazyExoticComponent<ComponentType> {
  uploads ??= lazy(async () => {
    const module = await loadRemote<{ default: ComponentType }>(`vision/${VISIN_UPLOADS_MODULE.replace(/^\.\//, '')}`);
    if (!module) throw new Error('Vision did not provide its upload panel.');
    return module;
  });
  return uploads;
}

/**
 * An app's exposed root as a lazy component. Created once per app, so after the
 * first visit its code is already loaded and moving back into it renders
 * without a loader.
 */
export function remoteComponent(app: ShellApp): LazyExoticComponent<ComponentType> {
  let component = components.get(app);
  if (!component) {
    component = lazy(async () => {
      const { title, urlKey } = APPS[app];
      const baseUrl = getGlobalConfig()[urlKey];
      if (!baseUrl) {
        throw new Error(`${urlKey} is not configured for this deployment.`);
      }
      ensureRemotesRegistered();
      let module: { default: ComponentType } | null;
      try {
        module = await loadRemote<{ default: ComponentType }>(`${app}/${VISIN_REMOTE_MODULE.replace(/^\.\//, '')}`);
      } catch (cause) {
        // The runtime's own message is a paragraph of diagnostics and a docs
        // link: the console's business, not the page's.
        console.error(`Loading ${title} failed`, cause);
        throw new Error(`Could not reach ${title} at ${baseUrl}.`, { cause });
      }
      if (!module) {
        throw new Error(`${title} did not provide its pages.`);
      }
      markLoaded(app);
      return module;
    });
    components.set(app, component);
  }
  return component;
}

/**
 * Drops a failed load so the next render tries again. React caches a lazy
 * component's rejection for good, so a retry needs a new one.
 */
export function forgetRemote(app: ShellApp): void {
  components.delete(app);
}
