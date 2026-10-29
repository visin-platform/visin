import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkItem, JobClass } from '../../types';
import type { EditorTool, SamPoint } from '../../editor/EditorCanvas';
import type { EditorDocument } from '../../editor/EditorDocument';
import type { Bbox } from '../../editor/boxes';
import { decodeMaskRle } from '../../editor/maskCodec';
import { ImageNeededError } from '../../localModel/client';
import type { LocalModel } from '../../localModel/useLocalModel';

interface SegmentToolOptions {
  item: WorkItem | null;
  taskId: string | null;
  tool: EditorTool;
  model: LocalModel;
  doc: EditorDocument | null;
  activeClass: JobClass | null;
  frameBlob: () => Promise<Blob>;
  onError: (message: string) => void;
}

/**
 * The segment tool's state: the clicks and box the annotator gave, the mask the model drew from them, and keeping
 * it. Everything resets when the frame changes or the annotator leaves the tool.
 */
export const useSegmentTool = ({ item, taskId, tool, model, doc, activeClass, frameBlob, onError }: SegmentToolOptions) => {
  const [samPoints, setSamPoints] = useState<SamPoint[]>([]);
  const [samBox, setSamBox] = useState<Bbox | null>(null);
  const [samPreview, setSamPreview] = useState<{ width: number; height: number; data: Uint8Array } | null>(null);
  const [samBusy, setSamBusy] = useState(false);
  const samRequest = useRef(0);
  const imageSentRef = useRef<string | null>(null);

  const clearSam = useCallback(() => {
    samRequest.current += 1;
    setSamPoints([]);
    setSamBox(null);
    setSamPreview(null);
    setSamBusy(false);
  }, []);

  // A new frame starts clean, and leaving the segment tool drops what it was working on.
  useEffect(() => clearSam(), [taskId, clearSam]);
  useEffect(() => {
    if (tool !== 'sam') clearSam();
  }, [tool, clearSam]);

  /** One more click, or a dragged box, for the segment tool: ask the model for the mask. */
  const samPrompt = useCallback(
    async (points: SamPoint[], box: Bbox | null) => {
      if (!item) return;
      setSamPoints(points);
      setSamBox(box);
      const request = ++samRequest.current;
      if (points.length === 0 && !box) {
        setSamPreview(null);
        setSamBusy(false);
        return;
      }
      setSamBusy(true);
      try {
        const id = item.task._id;
        const send = async (withImage: boolean) =>
          model.segment({ imageId: id, ...(withImage ? { image: await frameBlob() } : {}), points, ...(box ? { box } : {}) });
        let result;
        try {
          result = await send(imageSentRef.current !== id);
        } catch (err) {
          if (!(err instanceof ImageNeededError)) throw err;
          result = await send(true);
        }
        imageSentRef.current = id;
        if (request !== samRequest.current) return;
        setSamPreview(decodeMaskRle(result.rle));
      } catch (err) {
        if (request === samRequest.current) onError((err as Error).message);
      } finally {
        if (request === samRequest.current) setSamBusy(false);
      }
    },
    [item, model, frameBlob, onError]
  );

  /** Keep the model's mask: painted as the active class, around what is already drawn. */
  const commitSam = useCallback(
    (overwrite: boolean) => {
      if (!doc || !samPreview || !activeClass) return;
      doc.paintMask(samPreview.data, activeClass.maskIndex, overwrite);
      clearSam();
    },
    [doc, samPreview, activeClass, clearSam]
  );

  return { samPoints, samBox, samPreview, samBusy, samPrompt, clearSam, commitSam };
};
