import { expect, it, vi } from 'vitest';
import { inAppPath, openBesideChat } from './inAppLinks';

const click = (html: string, init: Partial<Parameters<typeof inAppPath>[0]> = {}) => {
  document.body.innerHTML = html;
  return inAppPath({ target: document.querySelector('#t'), button: 0, ...init });
};

it('takes a plain click on a path of this app, including from a child of the link', () => {
  expect(click('<a id="t" href="/projects/abc">Road</a>')).toBe('/projects/abc');
  expect(click('<a href="/trainings/abc?tab=epochs"><b id="t">Run</b></a>')).toBe('/trainings/abc?tab=epochs');
});
it.each([
  ['another site', '<a id="t" href="https://example.com/x">x</a>', {}],
  ['a scheme-less other site', '<a id="t" href="//example.com/x">x</a>', {}],
  ['a mail link', '<a id="t" href="mailto:a@example.com">x</a>', {}],
  ['an in-page anchor', '<a id="t" href="#top">x</a>', {}],
  ['a new tab', '<a id="t" href="/projects/a" target="_blank">x</a>', {}],
  ['a download', '<a id="t" href="/files/a" download>x</a>', {}],
  ['no link at all', '<span id="t">x</span>', {}],
  ['a ctrl click', '<a id="t" href="/projects/a">x</a>', { ctrlKey: true }],
  ['a meta click', '<a id="t" href="/projects/a">x</a>', { metaKey: true }],
  ['a middle click', '<a id="t" href="/projects/a">x</a>', { button: 1 }],
  ['a click already handled', '<a id="t" href="/projects/a">x</a>', { defaultPrevented: true }]
])('leaves %s to the browser', (_name, html, init) => {
  expect(click(html, init)).toBeUndefined();
});
it('asks the shell to move the page, and writes no history itself', () => {
  const asked = vi.fn();
  const listener = (event: Event) => asked((event as CustomEvent).detail);
  window.addEventListener('visin:navigate', listener);
  const before = window.history.length;
  openBesideChat('/papers/abc');
  window.removeEventListener('visin:navigate', listener);
  expect(asked).toHaveBeenCalledWith('/papers/abc');
  expect(window.history.length).toBe(before);
  expect(window.location.pathname).not.toBe('/papers/abc');
});
