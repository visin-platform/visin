import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoxObject, WorkItem, JobClass } from '../../types';
import type { EditorDocument } from '../../editor/EditorDocument';

import { toSuggestions } from '../../localModel/matchClasses';
import type { LocalModel } from '../../localModel/useLocalModel';

interface ModelDetectOptions {
  item: WorkItem | null;
  taskId: string | null;
  canLabel: boolean;
  classes: JobClass[];
  doc: EditorDocument | null;
  model: LocalModel;
  frameBlob: () => Promise<Blob>;
  setModelSuggestions: (boxes: BoxObject[]) => void;
  /** `null` clears the message; a manual run clears it before it starts. */
  onError: (message: string | null) => void;
}

/**
 * Boxes suggested by the connected model: the run itself, a message when it found nothing usable, and the
 * automatic run as an unlabeled frame opens.
 */
export const useModelDetect = ({ item, taskId, canLabel, classes, doc, model, frameBlob, setModelSuggestions, onError }: ModelDetectOptions) => {
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const detectRequest = useRef(0);
  const detectedForRef = useRef<string | null>(null);

  // The frame on screen now, for answers that arrive after the annotator moved on.
  const currentTaskRef = useRef<string | null>(null);
  currentTaskRef.current = item?.task._id ?? null;

  const reset = useCallback(() => {
    detectRequest.current += 1;
    setDetecting(false);
    setDetectMessage(null);
  }, []);
  useEffect(() => reset(), [taskId, reset]);

  const runDetect = useCallback(
    async (manual: boolean) => {
      if (!doc || !item || !model.canDetect) return;
      const forTask = item.task._id;
      const request = ++detectRequest.current;
      setDetecting(true);
      setDetectMessage(null);
      if (manual) onError(null);
      try {
        const found = await model.detect(await frameBlob());
        // Boxes for a frame that is no longer on screen belong to no frame.
        if (currentTaskRef.current !== forTask || request !== detectRequest.current) return;
        const suggestions = toSuggestions(found, classes, doc.width, doc.height);
        setModelSuggestions(suggestions);
        if (found.length > 0 && suggestions.length === 0) {
          const names = [...new Set(found.map((entry) => entry.class))].join(', ');
          setDetectMessage(`The model detected ${found.length} objects (${names}), but none match this job’s box classes. Check the model class mappings and frame size.`);
        } else if (manual && found.length === 0) {
          setDetectMessage('The model found no objects above the score threshold. Try lowering the threshold in Model settings.');
        }
      } catch (err) {
        // Suggesting is a favour: a failure on its own is only worth a message when asked for.
        if (manual && request === detectRequest.current) onError((err as Error).message);
      } finally {
        if (request === detectRequest.current) setDetecting(false);
      }
    },
    [doc, item, model, frameBlob, setModelSuggestions, classes, onError]
  );

  // Suggest boxes as an unlabeled frame opens, when a model is there and nothing
  // else (an import, the annotator's own work) has claimed the frame.
  const { canDetect } = model;
  const autoDetect = model.settings.autoDetect;
  const runDetectRef = useRef(runDetect);
  runDetectRef.current = runDetect;
  useEffect(() => {
    detectedForRef.current = null;
    reset();
  }, [classes, reset]);
  useEffect(() => {
    if (!canLabel || !canDetect || !autoDetect || !doc || !item || !taskId) return;
    if (detectedForRef.current === taskId) return;
    if (item.annotation.mine || item.suggestions || doc.boxes.length > 0 || doc.hasMask) return;
    detectedForRef.current = taskId;
    void runDetectRef.current(false);
  }, [canLabel, canDetect, autoDetect, doc, item, taskId, classes]);

  return { detecting, detectMessage, setDetectMessage, runDetect };
};
