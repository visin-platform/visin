import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageNeededError, ModelError, detect, getInfo, normalizeUrl, segment } from './client';
import { encodeMaskRle } from '../editor/maskCodec';

const fetchMock = vi.fn();

const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const SETTINGS = { url: 'http://localhost:8000' };

describe('normalizeUrl', () => {
  it('adds a scheme, drops trailing slashes and blanks', () => {
    expect(normalizeUrl('localhost:8000/')).toBe('http://localhost:8000');
    expect(normalizeUrl(' https://gpu.example.test// ')).toBe('https://gpu.example.test');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('getInfo', () => {
  it('keeps the deadline when the headers arrive but the body stalls', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => ({
        ok: true, status: 200,
        json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
      }));
      const pending = expect(getInfo(SETTINGS)).rejects.toMatchObject({ kind: 'unreachable' });
      await vi.advanceTimersByTimeAsync(4100);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports malformed JSON as a server error', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } });
    await expect(getInfo(SETTINGS)).rejects.toMatchObject({ kind: 'server', message: 'The model server returned invalid JSON' });
  });
  it('reads what the server has loaded, sending the token when there is one', async () => {
    fetchMock.mockResolvedValue(reply({ name: 'visin-infer', device: 'RTX', classes: ['car'], supports: { detect: true, segment: false } }));

    const info = await getInfo({ ...SETTINGS, token: 't0k' });

    expect(info.device).toBe('RTX');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/info');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'X-Visin-Token': 't0k' });
  });

  it('says the server cannot be reached, whatever the reason', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(getInfo(SETTINGS)).rejects.toMatchObject({ kind: 'unreachable' });
    await expect(getInfo(SETTINGS)).rejects.toThrow('Could not reach the model server at http://localhost:8000');
  });

  it('turns a refusal into what to do about it', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'token required' }, 401));
    await expect(getInfo(SETTINGS)).rejects.toMatchObject({ kind: 'unauthorized' });

    fetchMock.mockResolvedValueOnce(reply({ error: 'origin not allowed' }, 403));
    await expect(getInfo(SETTINGS)).rejects.toThrow(/--allow-origin/);

    fetchMock.mockResolvedValueOnce(reply({ error: 'boom' }, 500));
    await expect(getInfo(SETTINGS)).rejects.toMatchObject({ kind: 'server', message: 'boom' });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => Promise.reject(new Error('html')) });
    await expect(getInfo(SETTINGS)).rejects.toThrow('answered 502');
    expect(new ModelError('server', 'x')).toBeInstanceOf(Error);
  });

  it('gives up on a server that does not answer', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    );

    const pending = getInfo(SETTINGS);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'unreachable' });
    await vi.advanceTimersByTimeAsync(4100);
    await assertion;
    vi.useRealTimers();
  });
});

describe('detect', () => {
  it('posts the image bytes and returns the boxes', async () => {
    fetchMock.mockResolvedValue(reply({ boxes: [{ bbox: [1, 2, 3, 4], class: 'car', score: 0.9 }] }));
    const image = new Blob(['jpeg'], { type: 'image/jpeg' });

    const boxes = await detect(SETTINGS, image, 0.4);

    expect(boxes).toEqual([{ bbox: [1, 2, 3, 4], class: 'car', score: 0.9 }]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/detect?minScore=0.4');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: image });
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('image/jpeg');
  });

  it('reports a failed detection', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'no detector is loaded' }, 501));
    await expect(detect(SETTINGS, new Blob(['x']), 0.3)).rejects.toThrow('no detector is loaded');
  });

  it('sends an image of no known type as bytes', async () => {
    fetchMock.mockResolvedValue(reply({ boxes: [] }));
    await detect(SETTINGS, new Blob(['x']), 0.3);
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('application/octet-stream');
  });
});

describe('segment', () => {
  const rle = encodeMaskRle(2, 1, Uint8Array.from([0, 1]));
  const answer = {
    rle: btoa(String.fromCharCode(...rle)),
    width: 2,
    height: 1,
    bbox: [1, 0, 1, 1],
    score: 0.8
  };

  it('sends the prompts, with the image only when asked to', async () => {
    fetchMock.mockResolvedValue(reply(answer));

    const result = await segment(SETTINGS, {
      imageId: 't1',
      points: [{ x: 5, y: 6, label: 1 }],
      box: [1, 2, 3, 4]
    });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ imageId: 't1', points: [{ x: 5, y: 6, label: 1 }], box: [1, 2, 3, 4] });
    expect(Array.from(result.rle)).toEqual(Array.from(rle));
    expect(result.bbox).toEqual([1, 0, 1, 1]);
  });

  it('encodes the image as base64 when it has to send it', async () => {
    fetchMock.mockResolvedValue(reply(answer));

    await segment(SETTINGS, { imageId: 't1', image: new Blob(['abc']), points: [{ x: 1, y: 1, label: 0 }] });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).image).toBe(btoa('abc'));
  });

  it('encodes an image larger than one argument chunk', async () => {
    fetchMock.mockResolvedValue(reply(answer));
    const big = new Uint8Array(0x8000 * 2 + 5).fill(65);

    await segment(SETTINGS, { imageId: 't1', image: new Blob([big]), points: [{ x: 1, y: 1, label: 1 }] });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).image).toBe(btoa('A'.repeat(big.length)));
  });

  it('tells the caller when the server needs the image', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'image_needed' }, 409));

    await expect(segment(SETTINGS, { imageId: 't1', points: [{ x: 1, y: 1, label: 1 }] })).rejects.toBeInstanceOf(ImageNeededError);
  });

  it('reports a failed segmentation', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'RuntimeError: out of memory' }, 500));
    await expect(segment(SETTINGS, { imageId: 't1', points: [{ x: 1, y: 1, label: 1 }] })).rejects.toThrow('out of memory');
  });
});
