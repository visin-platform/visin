import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canChooseSpeaker,
  devicesDisagree,
  listAudioDevices,
  preferredMicrophone,
  preferredSpeaker,
  rememberMicrophone,
  rememberSpeaker,
  watchAudioDevices,
  type AudioDevices
} from './audioDevices';

const info = (kind: MediaDeviceKind, deviceId: string, label: string, groupId: string) =>
  ({ kind, deviceId, label, groupId }) as MediaDeviceInfo;

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

afterEach(() => {
  setMediaDevices(undefined);
  vi.restoreAllMocks();
});

describe('remembering the choice', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the microphone and the speakers apart, and forgets on null', () => {
    expect(preferredMicrophone()).toBeNull();
    rememberMicrophone('mic-1');
    rememberSpeaker('spk-1');

    expect(preferredMicrophone()).toBe('mic-1');
    expect(preferredSpeaker()).toBe('spk-1');

    rememberMicrophone(null);
    expect(preferredMicrophone()).toBeNull();
    expect(preferredSpeaker()).toBe('spk-1');
  });

  it('copes with storage that refuses', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(preferredMicrophone()).toBeNull();
    expect(() => rememberMicrophone('mic-1')).not.toThrow();
  });
});

describe('listAudioDevices', () => {
  it('splits microphones from speakers and leaves out what cannot be chosen', async () => {
    setMediaDevices({
      enumerateDevices: async () => [
        info('audioinput', 'default', 'Default - Headset', 'g1'),
        info('audioinput', 'communications', 'Communications - Headset', 'g1'),
        info('audioinput', 'mic-2', 'Webcam', 'g2'),
        info('audiooutput', 'default', 'Default - Headset', 'g1'),
        info('audiooutput', 'spk-2', 'Speakers', 'g3'),
        info('videoinput', 'cam', 'Camera', 'g2')
      ]
    });

    const devices = await listAudioDevices();

    expect(devices.microphones.map((d) => d.id)).toEqual(['default', 'mic-2']);
    expect(devices.speakers.map((d) => d.id)).toEqual(['default', 'spk-2']);
  });

  it('names a device that has no label yet, and drops one with no id', async () => {
    setMediaDevices({
      enumerateDevices: async () => [info('audioinput', 'a', '', ''), info('audioinput', '', '', '')]
    });

    expect((await listAudioDevices()).microphones).toEqual([{ id: 'a', label: 'Microphone 1', groupId: '' }]);
  });

  it('is empty where the browser cannot list devices or refuses to', async () => {
    setMediaDevices(undefined);
    expect(await listAudioDevices()).toEqual({ microphones: [], speakers: [] });

    setMediaDevices({
      enumerateDevices: async () => {
        throw new Error('NotAllowedError');
      }
    });
    expect(await listAudioDevices()).toEqual({ microphones: [], speakers: [] });
  });
});

describe('watchAudioDevices', () => {
  it('reports a headset coming and going, and stops when asked', () => {
    const target = new EventTarget();
    setMediaDevices(target);
    const onChange = vi.fn();

    const stop = watchAudioDevices(onChange);
    target.dispatchEvent(new Event('devicechange'));
    stop();
    target.dispatchEvent(new Event('devicechange'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is quiet where there is nothing to watch', () => {
    setMediaDevices(undefined);
    expect(() => watchAudioDevices(vi.fn())()).not.toThrow();
  });
});

describe('devicesDisagree', () => {
  const devices: AudioDevices = {
    microphones: [
      { id: 'default', label: 'Default', groupId: 'laptop' },
      { id: 'webcam', label: 'Webcam', groupId: 'cam' },
      { id: 'headset-mic', label: 'Headset', groupId: 'headset' }
    ],
    speakers: [
      { id: 'default', label: 'Default', groupId: 'laptop' },
      { id: 'headset-out', label: 'Headset', groupId: 'headset' }
    ]
  };

  it('is false when both are the same hardware', () => {
    expect(devicesDisagree(devices, 'headset-mic', 'headset-out')).toBe(false);
    expect(devicesDisagree(devices, null, null)).toBe(false);
  });

  it('is true when a microphone and speakers are different hardware', () => {
    expect(devicesDisagree(devices, 'webcam', 'headset-out')).toBe(true);
    expect(devicesDisagree(devices, 'headset-mic', null)).toBe(true);
  });

  it('falls back to the default for a device that is no longer there', () => {
    expect(devicesDisagree(devices, 'unplugged', null)).toBe(false);
  });

  it('says nothing when the browser gave no group', () => {
    const unknown: AudioDevices = {
      microphones: [{ id: 'a', label: 'A', groupId: '' }],
      speakers: [{ id: 'b', label: 'B', groupId: 'x' }]
    };
    expect(devicesDisagree(unknown, 'a', 'b')).toBe(false);
    expect(devicesDisagree({ microphones: [], speakers: [] }, null, null)).toBe(false);
  });
});

describe('canChooseSpeaker', () => {
  it('follows whether audio elements can be sent to an output', () => {
    const proto = HTMLMediaElement.prototype as unknown as { setSinkId?: unknown };
    delete proto.setSinkId;
    expect(canChooseSpeaker()).toBe(false);

    proto.setSinkId = () => Promise.resolve();
    expect(canChooseSpeaker()).toBe(true);
    delete proto.setSinkId;
  });
});
