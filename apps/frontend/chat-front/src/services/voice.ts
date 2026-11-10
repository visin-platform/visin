/**
 * Voice messages: what a recording is made as, and how it is described.
 * Mirrors chat-service's ALLOWED_AUDIO_TYPES; the server is the one that enforces it.
 */

/** A recording stops, and sends, at this length. */
export const MAX_VOICE_MS = 5 * 60 * 1000;

export interface RecordingFormat {
  /** What MediaRecorder is asked for, codec included. */
  recorderType: string;
  /** What the upload is labelled as: the container alone, as the server lists it. */
  mimetype: 'audio/webm' | 'audio/mp4' | 'audio/ogg';
  /** The file's name, whose extension is what file-service serves it by. */
  filename: string;
}

/**
 * In order of preference. AAC in MP4 first, because every browser plays it:
 * Safari records nothing else, and recent Chrome can record it too. Opus in
 * WebM or Ogg is for a browser that cannot (Firefox), and is the format an
 * older iPhone may not play.
 */
const FORMATS: RecordingFormat[] = [
  { recorderType: 'audio/mp4;codecs=mp4a.40.2', mimetype: 'audio/mp4', filename: 'voice.m4a' },
  { recorderType: 'audio/mp4', mimetype: 'audio/mp4', filename: 'voice.m4a' },
  { recorderType: 'audio/webm;codecs=opus', mimetype: 'audio/webm', filename: 'voice.weba' },
  { recorderType: 'audio/ogg;codecs=opus', mimetype: 'audio/ogg', filename: 'voice.ogg' },
  { recorderType: 'audio/webm', mimetype: 'audio/webm', filename: 'voice.weba' }
];

/** The first format this browser can record, or null when it cannot record at all. */
export function recordingFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATS.find((format) => MediaRecorder.isTypeSupported(format.recorderType)) ?? null;
}

export const isAudioType = (mimetype: string | undefined | null): boolean => Boolean(mimetype?.startsWith('audio/'));

/** Photos and videos: what goes in the grid, the lightbox and the album. */
export const isVisualType = (mimetype: string | undefined | null): boolean =>
  Boolean(mimetype?.startsWith('image/') || mimetype?.startsWith('video/'));

/** "0:07", "2:15". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
