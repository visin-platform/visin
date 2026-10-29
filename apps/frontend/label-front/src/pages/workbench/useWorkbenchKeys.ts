import { useEffect, useRef } from 'react';
import type { EditorDocument } from '../../editor/EditorDocument';
import type { EditorTool } from '../../editor/EditorCanvas';
import type { EditorPrefs } from '../../editor/useEditorPrefs';
import type { JobClass } from '../../types';
import { classHotkey } from '../../editor/classHotkey';

interface WorkbenchKeys {
  /** Whether a frame is open. */
  hasFrame: boolean;
  /** A dialog on top owns the keyboard: Enter there is its button, not Done. */
  dialogOpen: boolean;
  canLabel: boolean;
  doc: EditorDocument | null;
  classes: JobClass[];
  tool: EditorTool;
  brushDiameter: number;
  availableOverlays: { lidar: boolean; radar: boolean };
  overlays: { lidar: boolean; radar: boolean };
  samPreview: unknown | null;
  samBusy: boolean;
  step: (delta: number) => Promise<void>;
  finish: (outcome: 'done' | 'skip') => Promise<void>;
  chooseTool: (tool: EditorTool) => void;
  chooseClass: (key: string) => void;
  setPrefs: (next: Partial<EditorPrefs>) => void;
  clearSam: () => void;
  commitSam: (overwrite: boolean) => void;
  runDetect: (manual: boolean) => Promise<void>;
  acceptAllSuggestions: () => void;
  dismissSuggestions: () => void;
  onFit: () => void;
  onHelp: () => void;
  onToggleObjects: () => void;
}

/**
 * The editor's keyboard. Handled on `window` and with `preventDefault`, so Enter finishes the frame even when a
 * toolbar button still holds focus from a click.
 */
export const useWorkbenchKeys = (keys: WorkbenchKeys): void => {
  // The listener is added once and reads the latest values when a key arrives. Re-adding it whenever one of these
  // changed left a moment after each update in which Escape or Enter reached a handler that did not yet know about it.
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const {
        hasFrame,
        dialogOpen,
        canLabel,
        doc,
        classes,
        tool,
        brushDiameter,
        availableOverlays,
        overlays,
        samPreview,
        samBusy,
        step,
        finish,
        chooseTool,
        chooseClass,
        setPrefs,
        clearSam,
        commitSam,
        runDetect,
        acceptAllSuggestions,
        dismissSuggestions,
        onFit,
        onHelp,
        onToggleObjects
      } = latest.current;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!hasFrame || dialogOpen) return;
      const key = event.key;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && (key === 'z' || key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) doc?.redo();
        else doc?.undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        event.preventDefault();
        doc?.redo();
        return;
      }
      if (mod || event.altKey) return;

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        void step(key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (key === 'f' || key === 'F') {
        event.preventDefault();
        onFit();
        return;
      }
      if (key === '?') {
        onHelp();
        return;
      }
      if (key === 'o' || key === 'O') {
        onToggleObjects();
        return;
      }
      if (!canLabel) return;

      if (key === 'Escape' && samPreview) {
        clearSam();
      } else if (key === 'Enter' && samBusy) {
        event.preventDefault();
      } else if (key === 'Enter' && samPreview && tool === 'sam') {
        // A segment waiting to be kept comes first; the next Enter finishes the frame.
        event.preventDefault();
        commitSam(event.shiftKey);
      } else if (key === 'Enter') {
        event.preventDefault();
        void finish('done');
      } else if (key === 'd' || key === 'D') {
        void runDetect(true);
      } else if (key === 's' || key === 'S') {
        chooseTool('sam');
      } else if (key === 'k' || key === 'K') {
        event.preventDefault();
        void finish('skip');
      } else if (key === 'b' || key === 'B') {
        chooseTool('box');
      } else if (key === 'p' || key === 'P') {
        chooseTool('brush');
      } else if (key === 'e' || key === 'E') {
        chooseTool('eraser');
      } else if (key === '[' || key === ']') {
        setPrefs({ brushDiameter: Math.min(200, Math.max(2, brushDiameter + (key === ']' ? 4 : -4))) });
      } else if (key === 'v' || key === 'V') {
        const order: { lidar: boolean; radar: boolean }[] = [{ lidar: false, radar: false }];
        if (availableOverlays.lidar) order.push({ lidar: true, radar: false });
        if (availableOverlays.radar) order.push({ lidar: false, radar: true });
        if (availableOverlays.lidar && availableOverlays.radar) order.push({ lidar: true, radar: true });
        const at = order.findIndex((entry) => entry.lidar === overlays.lidar && entry.radar === overlays.radar);
        setPrefs({ overlays: order[(at + 1) % order.length] });
      } else if (key === 'Delete' || key === 'Backspace') {
        if (doc?.selectedId) {
          event.preventDefault();
          doc.deleteBox(doc.selectedId);
        }
      } else if (key === 'a' || key === 'A') {
        acceptAllSuggestions();
      } else if (key === 'x' || key === 'X') {
        dismissSuggestions();
      } else {
        const index = classes.findIndex((entry, i) => classHotkey(entry, i) === key);
        if (index >= 0) chooseClass(classes[index].key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
