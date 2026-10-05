import { BadRequestError } from '../../errors/HttpError';
import { avatarUrl, checkAvatar, sniffAvatarType } from '../../profile/avatar';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('pixels')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('pixels')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 pixels')]);

describe('sniffAvatarType', () => {
  it('knows JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffAvatarType(JPEG)).toBe('image/jpeg');
    expect(sniffAvatarType(PNG)).toBe('image/png');
    expect(sniffAvatarType(WEBP)).toBe('image/webp');
  });

  it('knows nothing else, or anything too short to tell', () => {
    expect(sniffAvatarType(Buffer.from('GIF89a pixels'))).toBeUndefined();
    expect(sniffAvatarType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(sniffAvatarType(Buffer.from('RIFF....WAVE'))).toBeUndefined();
    expect(sniffAvatarType(Buffer.from([0xff, 0xd8]))).toBeUndefined();
    expect(sniffAvatarType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('checkAvatar', () => {
  it('gives back the bytes and what they are', () => {
    expect(checkAvatar(PNG)).toEqual({ data: PNG, contentType: 'image/png' });
  });

  it('refuses a body that is not bytes, is empty, or is not an image it serves', () => {
    for (const body of [undefined, {}, 'text', Buffer.alloc(0), Buffer.from('GIF89a x')]) {
      expect(() => checkAvatar(body)).toThrow(BadRequestError);
    }
  });
});

describe('avatarUrl', () => {
  const version = new Date(1700000000000);

  it('is the first configured public address, a path and the version', () => {
    expect(
      avatarUrl('/auth/avatars/u1', version, ['PUBLIC', 'FALLBACK'], { FALLBACK: 'https://b.example.test/' })
    ).toBe('https://b.example.test/auth/avatars/u1?v=1700000000000');
    expect(
      avatarUrl('/auth/avatars/u1', version, ['PUBLIC', 'FALLBACK'], {
        PUBLIC: ' https://a.example.test// ',
        FALLBACK: 'https://b.example.test'
      })
    ).toBe('https://a.example.test/auth/avatars/u1?v=1700000000000');
  });

  it('has no default: unset or not an http(s) address, there is no address to hand out', () => {
    expect(avatarUrl('/x', version, ['PUBLIC'], {})).toBeUndefined();
    expect(avatarUrl('/x', version, ['PUBLIC'], { PUBLIC: 'javascript:alert(1)' })).toBeUndefined();
    expect(avatarUrl('/x', version, ['PUBLIC'], { PUBLIC: 'auth-service:5001' })).toBeUndefined();
  });
});
