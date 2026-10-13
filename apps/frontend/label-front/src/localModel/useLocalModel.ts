import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DetectedBox,
  ModelError,
  ModelInfo,
  ModelSettings,
  SegmentPrompt,
  SegmentResult,
  detect as detectCall,
  getInfo,
  normalizeUrl,
  segment as segmentCall
} from './client';

export interface LocalModelSettings extends ModelSettings {
  /** run the detector as each unlabeled frame opens */
  autoDetect: boolean;
  /** boxes the detector is less sure of than this are not shown */
  minScore: number;
}

export type ModelStatus = 'off' | 'connecting' | 'connected' | 'unreachable';

export interface LocalModel {
  settings: LocalModelSettings;
  status: ModelStatus;
  info: ModelInfo | null;
  /** why the last connect or call failed, in words an annotator can act on */
  error: string | null;
  canDetect: boolean;
  canSegment: boolean;
  /** save new settings and connect with them */
  connect: (next: Partial<LocalModelSettings>) => Promise<boolean>;
  disconnect: () => void;
  /** change a setting without reconnecting (auto-detect, threshold) */
  update: (patch: Partial<Pick<LocalModelSettings, 'autoDetect' | 'minScore'>>) => void;
  detect: (image: Blob) => Promise<DetectedBox[]>;
  segment: (prompt: SegmentPrompt) => Promise<SegmentResult>;
}

const STORAGE_KEY = 'visin-label-local-model';

const DEFAULTS: LocalModelSettings = { url: '', token: undefined, autoDetect: true, minScore: 0.35 };

const read = (): LocalModelSettings => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<LocalModelSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

const write = (settings: LocalModelSettings): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The model still works for this visit; it just has to be set up again next time.
  }
};

/**
 * The annotator's own model server, as the editor sees it.
 *
 * Settings live in this browser, not on the account: the address of a server on
 * one person's PC means nothing to anyone else, and the token is theirs. The
 * hook connects once on load if an address was saved. Every failure is quiet —
 * the status chip says what happened, and labeling by hand carries on — because
 * a model that is off must never get in the annotator's way.
 */
export const useLocalModel = (): LocalModel => {
  const [settings, setSettings] = useState<LocalModelSettings>(read);
  const [status, setStatus] = useState<ModelStatus>('off');
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const attempt = useRef(0);

  const connectWith = useCallback(async (next: LocalModelSettings): Promise<boolean> => {
    const id = ++attempt.current;
    const url = normalizeUrl(next.url);
    if (!url) {
      setStatus('off');
      setInfo(null);
      setError(null);
      return false;
    }
    setStatus('connecting');
    setError(null);
    try {
      const found = await getInfo({ url, token: next.token });
      if (id !== attempt.current) return false;
      setInfo(found);
      setStatus('connected');
      return true;
    } catch (err) {
      if (id !== attempt.current) return false;
      setInfo(null);
      setStatus('unreachable');
      setError((err as Error).message);
      return false;
    }
  }, []);

  useEffect(() => {
    if (settingsRef.current.url) void connectWith(settingsRef.current);
  }, [connectWith]);

  const connect = useCallback(
    async (patch: Partial<LocalModelSettings>) => {
      const next = { ...settingsRef.current, ...patch, url: normalizeUrl(patch.url ?? settingsRef.current.url) };
      setSettings(next);
      write(next);
      return connectWith(next);
    },
    [connectWith]
  );

  const disconnect = useCallback(() => {
    attempt.current += 1;
    const next = { ...settingsRef.current, url: '', token: undefined };
    setSettings(next);
    write(next);
    setStatus('off');
    setInfo(null);
    setError(null);
  }, []);

  const update = useCallback((patch: Partial<Pick<LocalModelSettings, 'autoDetect' | 'minScore'>>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    write(next);
  }, []);

  /** A call that failed because the server went away puts the chip back to unreachable. */
  const guarded = useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
    const id = attempt.current;
    try {
      return await run();
    } catch (err) {
      if (id === attempt.current && err instanceof ModelError && err.kind === 'unreachable') {
        setStatus('unreachable');
        setError(err.message);
      }
      throw err;
    }
  }, []);

  const detect = useCallback(
    (image: Blob) => guarded(() => detectCall(settingsRef.current, image, settingsRef.current.minScore)),
    [guarded]
  );
  const segment = useCallback((prompt: SegmentPrompt) => guarded(() => segmentCall(settingsRef.current, prompt)), [guarded]);

  return {
    settings,
    status,
    info,
    error,
    canDetect: status === 'connected' && Boolean(info?.supports.detect),
    canSegment: status === 'connected' && Boolean(info?.supports.segment),
    connect,
    disconnect,
    update,
    detect,
    segment
  };
};
