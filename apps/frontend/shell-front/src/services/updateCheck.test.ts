import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleScripts, newVersionDeployed } from './updateCheck';

const page = (...scripts: string[]) =>
  `<html><head><script>inline()</script>${scripts.join('')}</head><body></body></html>`;
const module = (src: string) => `<script type="module" crossorigin src="${src}"></script>`;

describe('moduleScripts', () => {
  it('lists module scripts by path, whatever the attribute order, and skips classic and inline ones', () => {
    expect(
      moduleScripts(
        page(
          module('/assets/index-aaa.js'),
          '<script src="/assets/classic.js"></script>',
          '<script src="https://cdn.example.test/x/main-bbb.js" type=\'module\'></script>',
          '<script type="module">inline()</script>'
        )
      )
    ).toEqual(['/assets/index-aaa.js', '/x/main-bbb.js']);
  });

  it('keeps an unparsable address as written', () => {
    expect(moduleScripts('<script type="module" src="http://[bad"></script>')).toEqual(['http://[bad']);
  });
});

describe('newVersionDeployed', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    const running = document.createElement('script');
    running.setAttribute('src', '/assets/index-aaa.js');
    document.head.append(running, document.createElement('script'));
  });
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: string, ok = true) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) }));

  it('is false while the server names the scripts that are running', async () => {
    serve(page(module('/assets/index-aaa.js')));
    expect(await newVersionDeployed()).toBe(false);
    expect(fetch).toHaveBeenCalledWith('/', { cache: 'no-store', headers: { accept: 'text/html' } });
  });

  it('is true when the server names a script this page is not running', async () => {
    serve(page(module('/assets/index-bbb.js')));
    expect(await newVersionDeployed()).toBe(true);
  });

  it('is false when the answer is an error, names no module script, or cannot be fetched', async () => {
    serve(page(module('/assets/index-bbb.js')), false);
    expect(await newVersionDeployed()).toBe(false);
    serve('<html>maintenance</html>');
    expect(await newVersionDeployed()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await newVersionDeployed()).toBe(false);
  });
});
