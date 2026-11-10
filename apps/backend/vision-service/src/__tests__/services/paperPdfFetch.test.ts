import { describe, expect, it } from 'vitest';
import { checkedUrl, isPublicAddress } from '../../services/paperPdfFetch';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('accepts %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not an address'
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('checkedUrl', () => {
  it('takes an https address on the standard port', () => {
    expect(checkedUrl('https://arxiv.org/pdf/2401.01234').hostname).toBe('arxiv.org');
    expect(checkedUrl('https://example.com:443/a.pdf').port).toBe('');
  });

  it.each([
    'http://example.com/a.pdf',
    'ftp://example.com/a.pdf',
    'file:///etc/passwd',
    'https://user:secret@example.com/a.pdf',
    'https://example.com:8443/a.pdf',
    'https://127.0.0.1/a.pdf',
    'https://[::1]/a.pdf',
    'https://169.254.169.254/latest/meta-data',
    'not a url'
  ])('refuses %s', (address) => {
    expect(() => checkedUrl(address)).toThrow();
  });
});
