import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration, isAudioType, isVisualType, recordingFormat } from './voice';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [7_400, '0:07'],
    [59_600, '1:00'],
    [135_000, '2:15']
  ])('writes %i ms as %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('recordingFormat', () => {
  afterEach(() => vi.unstubAllGlobals());

  const browser = (supported: string[]) => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => supported.includes(type) });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
  };

  it('prefers AAC in MP4, which every browser plays', () => {
    browser(['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2']);
    expect(recordingFormat()).toMatchObject({ mimetype: 'audio/mp4', filename: 'voice.m4a' });
  });

  it('records Opus in WebM where MP4 is not on offer, named so it is served as audio', () => {
    browser(['audio/webm;codecs=opus']);
    expect(recordingFormat()).toMatchObject({ mimetype: 'audio/webm', filename: 'voice.weba' });
  });

  it('is null where the browser cannot record', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(recordingFormat()).toBeNull();
  });
});

describe('type checks', () => {
  it('tells a voice message from photos and videos', () => {
    expect(isAudioType('audio/mp4')).toBe(true);
    expect(isVisualType('audio/mp4')).toBe(false);
    expect(isVisualType('video/mp4')).toBe(true);
    expect(isVisualType('application/pdf')).toBe(false);
  });
});
