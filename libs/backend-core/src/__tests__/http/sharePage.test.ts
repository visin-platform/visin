import type { Response } from 'express';
import { appLink, escapeHtml, excerpt, shellFrontUrl, renderSharePage, sendSharePage } from '../../http/sharePage';

describe('escapeHtml', () => {
  it('makes text safe between tags and inside an attribute', () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;'
    );
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});

describe('the address of the app', () => {
  it('is only what this deployment configures, without a trailing slash, and nothing else', () => {
    expect(shellFrontUrl({ SHELL_FRONT_URL: ' https://app.example.test/// ' })).toBe('https://app.example.test');
    expect(shellFrontUrl({})).toBeUndefined();
    expect(shellFrontUrl({ SHELL_FRONT_URL: '' })).toBeUndefined();
  });

  it('refuses anything that is not an http(s) address', () => {
    for (const value of [
      'javascript:alert(1)',
      'app.example.test',
      '//app.example.test',
      'ftp://app.example.test',
      'https://',
      'http://[bad',
      'https://user:pass@app.example.test',
      'https://app.example.test?q=x',
      'https://app.example.test#x'
    ]) {
      expect(shellFrontUrl({ SHELL_FRONT_URL: value })).toBeUndefined();
    }
  });

  it('joins a path to it, with or without its slash, and has none to join to when unconfigured', () => {
    const env = { SHELL_FRONT_URL: 'https://app.example.test' };
    expect(appLink('/projects/p1', env)).toBe('https://app.example.test/projects/p1');
    expect(appLink('projects/p1', env)).toBe('https://app.example.test/projects/p1');
    expect(appLink('/projects/p1', {})).toBeUndefined();
  });
});

describe('excerpt', () => {
  it('collapses whitespace to one line', () => {
    expect(excerpt('  one\n\n  two\t three ')).toBe('one two three');
  });

  it('cuts at the limit with an ellipsis, and leaves a short text alone', () => {
    expect(excerpt('a'.repeat(300), 10)).toBe('aaaaaaaaa…');
    expect(excerpt('short', 10)).toBe('short');
    expect(excerpt('', 10)).toBe('');
  });
});

describe('renderSharePage', () => {
  const page = {
    title: 'Window ablations',
    description: 'Swin window size study',
    url: 'https://app.example.test/projects/window',
    image: 'https://app.example.test/og.jpg'
  };

  it('tells an unfurler what the link is, and sends a person on to the app', () => {
    const html = renderSharePage(page);

    expect(html).toContain('<title>Window ablations</title>');
    expect(html).toContain('<meta property="og:title" content="Window ablations">');
    expect(html).toContain('<meta property="og:description" content="Swin window size study">');
    expect(html).toContain('<meta property="og:url" content="https://app.example.test/projects/window">');
    expect(html).toContain('<meta property="og:image" content="https://app.example.test/og.jpg">');
    expect(html).toContain('<meta property="og:site_name" content="Visin">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<link rel="canonical" href="https://app.example.test/projects/window">');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://app.example.test/projects/window">');
    expect(html).toContain('<a href="https://app.example.test/projects/window">Window ablations</a>');
  });

  it("asks to be left out of search, so the address that is indexed is the app's page", () => {
    expect(renderSharePage(page)).toContain('<meta name="robots" content="noindex">');
  });

  it('leaves out what it was not given, and makes a plain summary card without a picture', () => {
    const html = renderSharePage({ title: 'T', url: 'https://app.example.test/x' });

    expect(html).not.toContain('og:description');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('twitter:image');
    expect(html).not.toContain('name="description"');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });

  it('names the site, which a deployment may call something else', () => {
    expect(renderSharePage({ ...page, siteName: 'Road lab' })).toContain(
      '<meta property="og:site_name" content="Road lab">'
    );
  });

  it('escapes everything it was given: a title cannot close an attribute or open a script', () => {
    const html = renderSharePage({
      title: '"><script>alert(1)</script>',
      description: '"><img src=x onerror=alert(1)>',
      url: 'https://app.example.test/x?a=1&b="2"',
      siteName: '<b>'
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('https://app.example.test/x?a=1&amp;b=&quot;2&quot;');
  });

  it('links only to http(s): a javascript: or data: address is refused', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//app.example.test/x', '/relative']) {
      expect(() => renderSharePage({ title: 'T', url })).toThrow('http(s)');
    }
    expect(() =>
      renderSharePage({ title: 'T', url: 'https://app.example.test', image: 'javascript:alert(1)' })
    ).toThrow('http(s)');
  });
});

describe('sendSharePage', () => {
  it('sends HTML that nothing keeps and nothing in it can load or run', () => {
    const send = jest.fn();
    const set = jest.fn(() => ({ send }));
    const status = jest.fn(() => ({ set }));

    sendSharePage({ status } as unknown as Response, { title: 'T', url: 'https://app.example.test/x' });

    expect(status).toHaveBeenCalledWith(200);
    expect(set).toHaveBeenCalledWith({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    expect(send).toHaveBeenCalledWith(expect.stringContaining('<title>T</title>'));
  });
});
