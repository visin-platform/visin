import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { preferredMicrophone } from '../services/audioDevices';
import { MAX_VOICE_MS, recordingFormat, type RecordingFormat } from '../services/voice';

/** A finished recording, ready to upload. */
export interface VoiceRecording {
  blob: Blob;
  format: RecordingFormat;
  /**
   * Timed here rather than read from the file: a WebM that MediaRecorder writes
   * has no duration in it, and the player would show 0:00 or Infinity.
   */
  durationMs: number;
}

export type RecorderState = 'idle' | 'starting' | 'recording';

/**
 * Why a recording ended without being asked to: it reached MAX_VOICE_MS, or
 * the microphone went away under it (a phone call, a headset disconnecting,
 * an iPhone locking its screen).
 */
export type VoiceEnd = 'limit' | 'interrupted';

export interface UseVoiceRecorderResult {
  /** False where the browser cannot record; the mic button is then not offered. */
  supported: boolean;
  state: RecorderState;
  elapsedMs: number;
  /**
   * The microphone's loudness over the last few seconds, oldest first, each 0
   * to 1. Empty where the browser cannot measure it.
   */
  levels: number[];
  /** Why the last start failed, in words for the person. Clears itself after a while. */
  error: string | null;
  start: () => Promise<void>;
  /** Ends the recording and hands it over. Null for one too short to be meant. */
  stop: () => Promise<VoiceRecording | null>;
  /** Ends the recording and throws it away. */
  cancel: () => void;
}

/** A tap on the mic and straight off again is a slip, not a message. */
const MIN_VOICE_MS = 500;

/** How often the timer and the level meter move. */
const TICK_MS = 100;

/** Bars kept for the meter: four seconds of them. */
const LEVEL_COUNT = 40;

const ERROR_MS = 6000;

interface Meter {
  read: () => number;
  close: () => void;
}

/**
 * How loud the microphone is, for the bars beside the timer. They are how a
 * person sees the right microphone is hearing them before they have said a
 * minute into the wrong one.
 *
 * The analyser is not connected to the speakers, so nothing is played back.
 * Null where Web Audio is missing; the recording does not depend on it.
 */
function meterFor(media: MediaStream): Meter | null {
  const Context =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    const context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(media).connect(analyser);
    // Started outside the tap that asked for it, so some browsers create it suspended.
    void context.resume().catch(() => {});
    const samples = new Uint8Array(analyser.fftSize);
    return {
      read: () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          sum += value * value;
        }
        // Speech sits low on this scale; the factor makes a normal voice fill most of a bar.
        return Math.min(1, Math.sqrt(sum / samples.length) * 4);
      },
      close: () => void context.close().catch(() => {})
    };
  } catch {
    return null;
  }
}

/**
 * Records one voice message at a time from the microphone.
 *
 * The microphone is released the moment a recording ends, however it ends, so
 * the browser's "in use" light never stays on after the person is done.
 *
 * `onEnded` gets a recording that stopped by itself, and why. One that was
 * asked to stop comes back from `stop` instead.
 */
export function useVoiceRecorder(
  onEnded: (recording: VoiceRecording, reason: VoiceEnd) => void
): UseVoiceRecorderResult {
  const [format] = useState(recordingFormat);
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<Meter | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Waiting on the recorder's `stop` event, when `stop` was what ended it. */
  const pending = useRef<{ resolve: (recording: VoiceRecording | null) => void; durationMs: number } | null>(null);
  /**
   * Counts starts and cancels. A start whose number has moved on by the time
   * the mic arrives was cancelled (or the page left) while the browser asked.
   */
  const attempt = useRef(0);
  const endedHandler = useRef(onEnded);
  useEffect(() => {
    endedHandler.current = onEnded;
  });

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const release = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    meter.current?.close();
    meter.current = null;
    recorder.current = null;
    chunks.current = [];
    setState('idle');
    setElapsedMs(0);
    setLevels([]);
  }, []);

  const stop = useCallback((): Promise<VoiceRecording | null> => {
    // First, so the limit check cannot run this a second time while the last
    // chunk is still on its way.
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    const active = recorder.current;
    if (!active || active.state === 'inactive') {
      release();
      return Promise.resolve(null);
    }
    const durationMs = Math.min(Date.now() - startedAt.current, MAX_VOICE_MS);
    return new Promise((resolve) => {
      pending.current = { resolve, durationMs };
      active.stop();
    });
  }, [release]);

  const cancel = useCallback(() => {
    attempt.current += 1;
    const active = recorder.current;
    if (active) active.onstop = null;
    if (active && active.state !== 'inactive') active.stop();
    pending.current?.resolve(null);
    pending.current = null;
    release();
  }, [release]);

  const start = useCallback(async () => {
    if (!format || recorder.current) return;
    setError(null);
    setState('starting');
    const mine = ++attempt.current;

    let media: MediaStream;
    try {
      // The microphone chosen for calls, if there is one. `ideal` rather than
      // `exact`, so an unplugged headset falls back to the default.
      const microphone = preferredMicrophone();
      media = await navigator.mediaDevices.getUserMedia({
        audio: microphone ? { deviceId: { ideal: microphone } } : true
      });
    } catch (cause) {
      // Cancelled while the browser was asking: nothing to tell anyone.
      if (mine !== attempt.current) return;
      const name = (cause as DOMException).name;
      setError(
        name === 'NotAllowedError'
          ? 'The microphone is blocked. Allow it for this site to record.'
          : 'Could not reach a microphone.'
      );
      setState('idle');
      return;
    }

    if (mine !== attempt.current) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const next = new MediaRecorder(media, { mimeType: format.recorderType });
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      // Every ending comes through here, asked for or not. The last chunk
      // arrives in `dataavailable`, which fires first.
      next.onstop = () => {
        const asked = pending.current;
        pending.current = null;
        const durationMs = asked?.durationMs ?? Math.min(Date.now() - startedAt.current, MAX_VOICE_MS);
        const blob = new Blob(chunks.current, { type: format.mimetype });
        const recording = durationMs < MIN_VOICE_MS || blob.size === 0 ? null : { blob, format, durationMs };
        release();
        if (asked) asked.resolve(recording);
        else if (recording) endedHandler.current(recording, 'interrupted');
      };
      // A microphone taken away mid-recording ends the track. Not every
      // browser stops the recorder for it, so it is stopped here.
      media.getTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          if (next.state !== 'inactive') next.stop();
        })
      );

      stream.current = media;
      recorder.current = next;
      meter.current = meterFor(media);
      chunks.current = [];
      next.start();
      startedAt.current = Date.now();
      setElapsedMs(0);
      setLevels([]);
      setState('recording');

      ticker.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;
        setElapsedMs(elapsed);
        const level = meter.current?.read();
        if (level !== undefined) setLevels((current) => [...current.slice(1 - LEVEL_COUNT), level]);
        if (elapsed >= MAX_VOICE_MS) {
          void stop().then((recording) => recording && endedHandler.current(recording, 'limit'));
        }
      }, TICK_MS);
    } catch (cause) {
      logger.warn('Voice recording could not start', { error: (cause as Error).message });
      media.getTracks().forEach((track) => track.stop());
      meter.current?.close();
      meter.current = null;
      setError('Could not start recording.');
      setState('idle');
    }
  }, [format, release, stop]);

  // Leaving the conversation mid-recording drops it and lets go of the mic.
  useEffect(() => cancel, [cancel]);

  return { supported: format !== null, state, elapsedMs, levels, error, start, stop, cancel };
}
