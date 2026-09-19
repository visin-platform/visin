import { describeUserAgent } from '../../services/userAgent';

describe('describeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15', 'Firefox on iPad'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 OPR/112.0', 'Opera on Windows'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', 'Samsung Internet on Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Chrome on ChromeOS']
  ])('%s → %s', (userAgent, label) => {
    expect(describeUserAgent(userAgent)).toBe(label);
  });

  it('names what it can recognise and no more', () => {
    expect(describeUserAgent('SomeBot/1.0 (Windows)')).toBe('Windows');
    expect(describeUserAgent('Mozilla/5.0 Firefox/130.0')).toBe('Firefox');
    expect(describeUserAgent('curl/8.5.0')).toBe('Unknown device');
    expect(describeUserAgent(undefined)).toBe('Unknown device');
    expect(describeUserAgent('')).toBe('Unknown device');
  });
});
