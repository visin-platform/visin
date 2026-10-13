import { useCallback, useState } from 'react';
import type { EditorTool } from './EditorCanvas';

export interface EditorPrefs {
  tool: EditorTool;
  classKey: string | null;
  brushDiameter: number;
  maskOpacity: number;
  overlays: { lidar: boolean; radar: boolean };
}

const DEFAULTS: EditorPrefs = {
  tool: 'box',
  classKey: null,
  brushDiameter: 24,
  maskOpacity: 0.55,
  overlays: { lidar: false, radar: false }
};

const key = (jobId: string): string => `visin-label-editor:${jobId}`;

const read = (jobId: string): EditorPrefs => {
  try {
    const stored = window.localStorage.getItem(key(jobId));
    if (!stored) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(stored) as Partial<EditorPrefs>) };
  } catch {
    return DEFAULTS;
  }
};

/**
 * What the annotator last chose — tool, class, brush size, sensors — kept for
 * the job, so the editor opens the way it was left. A convenience only: storage
 * may be absent or throw, and the defaults are fine without it.
 */
export const useEditorPrefs = (jobId: string): [EditorPrefs, (patch: Partial<EditorPrefs>) => void] => {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => read(jobId));
  const update = useCallback(
    (patch: Partial<EditorPrefs>) => {
      setPrefs((previous) => {
        const next = { ...previous, ...patch };
        try {
          window.localStorage.setItem(key(jobId), JSON.stringify(next));
        } catch {
          // Not worth interrupting labeling for.
        }
        return next;
      });
    },
    [jobId]
  );
  return [prefs, update];
};
