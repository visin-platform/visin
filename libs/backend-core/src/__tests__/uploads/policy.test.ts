import { getUploadPolicy } from '../../uploads/policy';

describe('upload policy', () => {
  it.each([
    ['bundle.zip', 'application/zip', 'zip', 10 * 1024 ** 3],
    ['bundle.tar.gz', 'application/gzip', 'gzip', 10 * 1024 ** 3],
    ['bundle.tgz', 'application/x-gzip', 'gzip', 10 * 1024 ** 3],
    ['bundle.tar', 'application/x-tar', 'tar', 10 * 1024 ** 3],
    ['a.PNG', 'image/png', 'png', 50 * 1024 ** 2],
    ['a.jpg', 'image/jpeg', 'jpeg', 50 * 1024 ** 2],
    ['a.jpeg', 'image/jpeg', 'jpeg', 50 * 1024 ** 2],
    ['a.gif', 'image/gif', 'gif', 50 * 1024 ** 2],
    ['a.webp', 'image/webp', 'webp', 50 * 1024 ** 2],
    ['a.mp4', 'video/mp4', 'mp4', 1024 ** 3],
    ['a.mov', 'video/quicktime', 'mov', 1024 ** 3],
    ['a.pdf', 'application/pdf', 'pdf', 50 * 1024 ** 2]
  ])('selects a server ceiling for %s', (file, mime, format, maxBytes) => {
    expect(getUploadPolicy(file, mime)).toEqual({ format, maxBytes });
  });
  it('accepts unknown browser MIME only for a known filename', () => {
    expect(getUploadPolicy('bundle.zip').format).toBe('zip');
  });
  it.each(['page.html', 'code.svg', 'a.exe', 'constructor'])('rejects unsupported active/unknown files: %s', file => {
    expect(() => getUploadPolicy(file)).toThrow('Unsupported');
  });
  it('rejects a mismatching declared media type', () => {
    expect(() => getUploadPolicy('a.png', 'text/html')).toThrow('mismatch');
  });
  it('limits each resource kind to its allowed formats', () => {
    expect(getUploadPolicy('a.zip', 'application/zip', 'archive').format).toBe('zip');
    expect(getUploadPolicy('a.png', 'image/png', 'image').format).toBe('png');
    expect(getUploadPolicy('a.png', 'image/png', 'visualization').format).toBe('png');
    expect(() => getUploadPolicy('a.png', 'image/png', 'archive')).toThrow('archive');
    expect(() => getUploadPolicy('a.zip', 'application/zip', 'image')).toThrow('raster');
    expect(() => getUploadPolicy('a.zip', 'application/zip', 'visualization')).toThrow('visualization');
  });
});
