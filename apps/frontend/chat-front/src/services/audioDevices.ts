/**
 * Which microphone and speakers a call uses.
 *
 * Without a choice the browser takes the system default for both, which is
 * often not the pair a person means: a Bluetooth headset can be the output
 * while the laptop's own microphone is the input, or the other way round. The
 * two then sit on different hardware, and echo cancellation, which can only
 * subtract what it knows it is playing, stops working.
 *
 * What was chosen is remembered per device, not per account: a headset on one
 * computer means nothing on a phone.
 */

const MICROPHONE_KEY = 'visin.call.microphone';
const SPEAKER_KEY = 'visin.call.speaker';

export interface AudioDevice {
  id: string;
  label: string;
  /** Devices that are one piece of hardware share it: a headset's mic and its speakers. */
  groupId: string;
}

export interface AudioDevices {
  microphones: AudioDevice[];
  speakers: AudioDevice[];
}

const NONE: AudioDevices = { microphones: [], speakers: [] };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    // Private mode: the choice lasts until the page closes, which is what it can do.
  }
}

export const preferredMicrophone = (): string | null => read(MICROPHONE_KEY);
export const preferredSpeaker = (): string | null => read(SPEAKER_KEY);
export const rememberMicrophone = (id: string | null): void => write(MICROPHONE_KEY, id);
export const rememberSpeaker = (id: string | null): void => write(SPEAKER_KEY, id);

/**
 * Whether the page can send a call to a particular output. Chrome and Edge can,
 * on desktop and Android. Safari and Firefox play through whatever the system
 * has chosen, and the picker says so instead of offering a list that does
 * nothing.
 */
export function canChooseSpeaker(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

function named(devices: MediaDeviceInfo[], kind: MediaDeviceKind, fallback: string): AudioDevice[] {
  return (
    devices
      // Before the microphone is allowed the list has no ids, which nothing can
      // be chosen by. "communications" is the system's second default, a copy
      // of a device that is already in the list.
      .filter((device) => device.kind === kind && device.deviceId !== '' && device.deviceId !== 'communications')
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `${fallback} ${index + 1}`,
        groupId: device.groupId
      }))
  );
}

export async function listAudioDevices(): Promise<AudioDevices> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return NONE;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      microphones: named(all, 'audioinput', 'Microphone'),
      speakers: named(all, 'audiooutput', 'Speaker')
    };
  } catch {
    return NONE;
  }
}

/** Calls `onChange` when a headset is plugged in or pulled out. */
export function watchAudioDevices(onChange: () => void): () => void {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!media?.addEventListener) return () => undefined;
  media.addEventListener('devicechange', onChange);
  return () => media.removeEventListener('devicechange', onChange);
}

/** The device a choice means: the one named, or the system default when it is gone or none was named. */
function resolve(devices: AudioDevice[], id: string | null): AudioDevice | undefined {
  return devices.find((device) => device.id === id) ?? devices.find((device) => device.id === 'default') ?? devices[0];
}

/**
 * Whether the microphone and the speakers are two pieces of hardware.
 *
 * It is a hint, not a fault: wired earbuds on a laptop's microphone are fine,
 * since nothing acoustic runs from one to the other. With speakers it is the
 * usual cause of the other person hearing themselves. Unknown groups say no.
 */
export function devicesDisagree(
  devices: AudioDevices,
  microphoneId: string | null,
  speakerId: string | null
): boolean {
  const microphone = resolve(devices.microphones, microphoneId);
  const speaker = resolve(devices.speakers, speakerId);
  if (!microphone?.groupId || !speaker?.groupId) return false;
  return microphone.groupId !== speaker.groupId;
}
