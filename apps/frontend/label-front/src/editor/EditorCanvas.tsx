import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box } from '@mui/material';
import { onImage } from '@visin/frontend-core';
import { BoxObject, JobClass, TaskImages } from '../types';
import { EditorDocument } from './EditorDocument';
import {
  Bbox,
  Handle,
  boxAt,
  clampBox,
  handleAt,
  isDrawable,
  moveBox,
  rectFromPoints,
  resizeBox
} from './boxes';
import { MaskPainter, buildPalette } from './maskPainter';
import { newBoxId } from './ids';
import { rampColor, valueRange } from './sensorColors';
import { Viewport, fitViewport, panBy, toImagePoint, zoomAt } from './viewport';
import CanvasOverlay from './CanvasOverlay';

export type EditorTool = 'box' | 'brush' | 'eraser' | 'sam';

/** One click on the object (`label` 1) or off it (0), in frame pixels. */
export interface SamPoint {
  x: number;
  y: number;
  label: 0 | 1;
}

/** Click-to-segment in progress: the prompts so far, and the model's current answer to them. */
export interface SamState {
  points: SamPoint[];
  box: Bbox | null;
  /** the model's mask for these prompts: 1 where the object is */
  preview: { width: number; height: number; data: Uint8Array } | null;
  busy: boolean;
  onPrompt: (points: SamPoint[], box: Bbox | null) => void;
}

export interface EditorCanvasProps {
  doc: EditorDocument;
  images: TaskImages;
  classes: JobClass[];
  /** a class's colour as it should draw in the scheme showing */
  colorOf: (jobClass: JobClass) => string;
  tool: EditorTool;
  /** the class a new box or stroke is for; null when the job has none that fits */
  activeClass: JobClass | null;
  /** brush radius in frame pixels */
  brushRadius: number;
  maskOpacity: number;
  /** which overlay sensors are drawn */
  overlays: { lidar: boolean; radar: boolean };
  suggestionBoxes: BoxObject[];
  suggestionMask: Uint8Array | null;
  onAcceptSuggestion: (id: string) => void;
  /** a viewer who may not label: boxes and masks show, but nothing can be drawn */
  readOnly: boolean;
  viewport: Viewport | null;
  onViewportChange: (viewport: Viewport) => void;
  /** called when a box is picked, so the class bar can follow it */
  onPickClass?: (classKey: string) => void;
  /** present while the SAM tool is available */
  sam?: SamState;
}

const DRAG_THRESHOLD_PX = 4;
const HANDLE_HIT_PX = 10;
const ZOOM_STEP = 1.2;

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'draw'; x: number; y: number }
  | { kind: 'move'; id: string; x: number; y: number; origin: Bbox; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle }
  | { kind: 'stroke'; x: number; y: number }
  | { kind: 'sam'; x: number; y: number; label: 0 | 1; moved: boolean };

/**
 * The surface an annotator draws on: the frame with the sensors over it, the
 * mask, the boxes, and the pointer logic that edits them.
 *
 * The frame and mask are CSS-transformed so zooming costs nothing; boxes are an
 * SVG in screen space so their lines stay one pixel wide at any zoom. Everything
 * that changes the labels goes through the `EditorDocument`, which is what
 * makes it undoable and what autosave watches.
 */
const EditorCanvas: React.FC<EditorCanvasProps> = ({
  doc,
  images,
  classes,
  colorOf,
  tool,
  activeClass,
  brushRadius,
  maskOpacity,
  overlays,
  suggestionBoxes,
  suggestionMask,
  onAcceptSuggestion,
  readOnly,
  viewport,
  onViewportChange,
  onPickClass,
  sam
}) => {
  const version = useSyncExternalStore(doc.subscribe, doc.getVersion);
  const containerRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const suggestionCanvasRef = useRef<HTMLCanvasElement>(null);
  const samCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<MaskPainter | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const fittedRef = useRef<Viewport | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<Bbox | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const { width, height } = doc;
  const classByKey = useMemo(() => new Map(classes.map((entry) => [entry.key, entry])), [classes]);
  const palette = useMemo(
    () => buildPalette(classes.map((entry) => ({ maskIndex: entry.maskIndex, color: colorOf(entry) }))),
    [classes, colorOf]
  );

  // Measure the container and fit the frame to it, until the annotator zooms or pans.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setContainerSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerSize) return;
    const fitted = fittedRef.current;
    const untouched =
      !viewport ||
      (fitted !== null &&
        viewport.scale === fitted.scale &&
        viewport.offsetX === fitted.offsetX &&
        viewport.offsetY === fitted.offsetY);
    if (!untouched) return;
    const next = fitViewport(width, height, containerSize.width, containerSize.height);
    // Re-fitting to the size it already has would hand the parent a new object each render.
    if (viewport && next.scale === viewport.scale && next.offsetX === viewport.offsetX && next.offsetY === viewport.offsetY) {
      return;
    }
    fittedRef.current = next;
    onViewportChange(next);
  }, [viewport, containerSize, width, height, onViewportChange]);

  // Paint the mask: everything when the document is new or the palette changed,
  // otherwise just the rectangle the last stroke touched.
  const paintedRef = useRef<{ doc: EditorDocument; palette: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const painted = paintedRef.current;
    if (!painterRef.current || !painted || painted.doc !== doc || painted.palette !== palette) {
      painterRef.current = new MaskPainter(context, width, height, palette);
      paintedRef.current = { doc, palette };
      painterRef.current.paint(doc.mask, null);
      doc.takeDirty();
      return;
    }
    painterRef.current.paint(doc.mask, doc.takeDirty());
  }, [doc, version, width, height, palette]);

  useEffect(() => {
    const canvas = suggestionCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !suggestionMask) return;
    new MaskPainter(context, width, height, palette).paint(suggestionMask, null);
  }, [suggestionMask, width, height, palette]);

  // The model's mask for the clicks so far, in the colour of the class it would become.
  const samPreview = sam?.preview ?? null;
  const samColor = activeClass ? colorOf(activeClass) : onImage.ink;
  useEffect(() => {
    const canvas = samCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!samPreview || samPreview.width !== width || samPreview.height !== height) return;
    new MaskPainter(context, width, height, buildPalette([{ maskIndex: 1, color: samColor }])).paint(samPreview.data, null);
  }, [samPreview, samColor, width, height]);

  // Radar points, dotted over the frame and coloured by their reading.
  const radar = images.sensors.find((sensor) => sensor.key === 'radar' && sensor.kind === 'points');
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, width, height);
    if (!radar || radar.kind !== 'points' || !overlays.radar) return;
    const range = valueRange(radar.points.map((point) => point.value));
    const dot = Math.max(3, Math.min(width, height) / 160);
    for (const point of radar.points) {
      const t = range && point.value !== undefined && range.max > range.min ? (point.value - range.min) / (range.max - range.min) : 0.5;
      context.fillStyle = rampColor(t);
      context.beginPath();
      context.arc(point.u, point.v, dot, 0, Math.PI * 2);
      context.fill();
    }
  }, [radar, overlays.radar, width, height]);

  // Space held pans with a primary-button drag, as in most image editors.
  useEffect(() => {
    // Only when nothing else wants the key: the page itself, or the editor. A
    // focused button or a dialog uses Space for itself.
    const ours = (target: EventTarget | null): boolean =>
      target === document.body || target === null || (target instanceof Node && Boolean(containerRef.current?.contains(target)));
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && ours(event.target)) {
        spaceRef.current = true;
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // A native, non-passive listener: React's onWheel is passive, and zooming has
  // to stop the page scrolling underneath.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const current = viewportRef.current;
      if (!current) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      onViewportChangeRef.current(
        zoomAt(current, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX - bounds.left, event.clientY - bounds.top)
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const local = useCallback((event: { clientX: number; clientY: number }) => {
    const bounds = containerRef.current!.getBoundingClientRect();
    return { px: event.clientX - bounds.left, py: event.clientY - bounds.top };
  }, []);

  const classAllows = (jobClass: JobClass | null, need: 'box' | 'mask'): boolean => Boolean(jobClass?.tools.includes(need));

  const onPointerDown = (event: React.PointerEvent) => {
    if (!viewport) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const { px, py } = local(event);
    const point = toImagePoint(viewport, px, py);

    if (event.button === 1 || spaceRef.current || readOnly) {
      dragRef.current = { kind: 'pan', lastX: px, lastY: py };
      setPanning(true);
      return;
    }
    if (tool === 'sam' && sam && (event.button === 0 || event.button === 2)) {
      dragRef.current = { kind: 'sam', x: point.x, y: point.y, label: event.button === 2 || event.altKey ? 0 : 1, moved: false };
      return;
    }
    if (event.button !== 0) return;

    if (tool === 'box') {
      const tolerance = HANDLE_HIT_PX / viewport.scale;
      if (selected) {
        const handle = handleAt(selected.bbox, point.x, point.y, tolerance);
        if (handle) {
          doc.beginGesture();
          dragRef.current = { kind: 'resize', id: selected.id, handle };
          return;
        }
      }
      const hit = boxAt(doc.boxes, point.x, point.y);
      if (hit) {
        doc.select(hit.id);
        onPickClass?.(hit.classKey);
        doc.beginGesture();
        dragRef.current = { kind: 'move', id: hit.id, x: point.x, y: point.y, origin: hit.bbox, moved: false };
        return;
      }
      const suggestion = boxAt(suggestionBoxes, point.x, point.y);
      if (suggestion) {
        onAcceptSuggestion(suggestion.id);
        return;
      }
      doc.select(null);
      if (classAllows(activeClass, 'box')) {
        dragRef.current = { kind: 'draw', x: point.x, y: point.y };
        setDraft([point.x, point.y, 0, 0]);
      }
      return;
    }

    // Brush and eraser both paint the mask; the eraser paints "nothing".
    if (tool === 'eraser' || classAllows(activeClass, 'mask')) {
      doc.beginStroke(tool === 'eraser' ? 0 : activeClass!.maskIndex, event.shiftKey);
      doc.strokeTo(point.x, point.y, brushRadius);
      dragRef.current = { kind: 'stroke', x: point.x, y: point.y };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!viewport) return;
    const { px, py } = local(event);
    const point = toImagePoint(viewport, px, py);
    setHover({ x: px, y: py });
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      onViewportChange(panBy(viewport, px - drag.lastX, py - drag.lastY));
      dragRef.current = { kind: 'pan', lastX: px, lastY: py };
    } else if (drag.kind === 'draw') {
      setDraft(rectFromPoints(drag.x, drag.y, Math.min(width, Math.max(0, point.x)), Math.min(height, Math.max(0, point.y))));
    } else if (drag.kind === 'move') {
      const dx = point.x - drag.x;
      const dy = point.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) * viewport.scale < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      doc.previewBox(drag.id, moveBox(drag.origin, dx, dy, width, height));
    } else if (drag.kind === 'resize') {
      const box = doc.boxes.find((candidate) => candidate.id === drag.id);
      if (box) doc.previewBox(drag.id, resizeBox(box.bbox, drag.handle, point.x, point.y, width, height));
    } else if (drag.kind === 'stroke') {
      doc.strokeTo(point.x, point.y, brushRadius, drag.x, drag.y);
      dragRef.current = { kind: 'stroke', x: point.x, y: point.y };
    } else if (drag.kind === 'sam') {
      if (drag.label === 1 && Math.hypot(point.x - drag.x, point.y - drag.y) * viewport.scale >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
        setDraft(rectFromPoints(drag.x, drag.y, Math.min(width, Math.max(0, point.x)), Math.min(height, Math.max(0, point.y))));
      }
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    if (!drag) return;
    if (drag.kind === 'draw') {
      const end = viewport ? toImagePoint(viewport, local(event).px, local(event).py) : { x: drag.x, y: drag.y };
      const bbox = clampBox(rectFromPoints(drag.x, drag.y, end.x, end.y), width, height);
      setDraft(null);
      if (isDrawable(bbox) && activeClass) {
        doc.addBox({ id: newBoxId(), classKey: activeClass.key, bbox, source: 'human' });
      }
    } else if (drag.kind === 'move' || drag.kind === 'resize') {
      doc.commitGesture();
    } else if (drag.kind === 'stroke') {
      doc.endStroke();
    } else if (drag.kind === 'sam' && sam) {
      if (drag.moved && viewport) {
        const end = toImagePoint(viewport, local(event).px, local(event).py);
        const box = clampBox(rectFromPoints(drag.x, drag.y, end.x, end.y), width, height);
        setDraft(null);
        if (isDrawable(box)) sam.onPrompt(sam.points, box);
      } else {
        // The first click inside a box already drawn takes that box as well:
        // a point and a box together tell SAM exactly which object is meant.
        const around = !sam.box && sam.points.length === 0 && drag.label === 1 ? boxAt(doc.boxes, drag.x, drag.y) : undefined;
        sam.onPrompt([...sam.points, { x: drag.x, y: drag.y, label: drag.label }], around ? around.bbox : sam.box);
      }
    }
  };

  const transform = viewport ? `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})` : undefined;
  const scale = viewport?.scale ?? 1;
  const offsetX = viewport?.offsetX ?? 0;
  const offsetY = viewport?.offsetY ?? 0;

  const selected = doc.boxes.find((box) => box.id === doc.selectedId);
  const lidar = images.sensors.find((sensor) => sensor.key === 'lidar' && sensor.kind === 'image');
  const brushActive = !readOnly && (tool === 'eraser' || (tool === 'brush' && classAllows(activeClass, 'mask')));

  const cursor = panning
    ? 'grabbing'
    : readOnly
      ? 'grab'
      : brushActive
        ? 'none'
        : tool === 'box' || tool === 'sam'
          ? 'crosshair'
          : 'default';

  return (
    <Box
      ref={containerRef}
      data-testid="editor-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(event) => {
        // Right-click is "not this" for the SAM tool, not the browser's menu.
        if (tool === 'sam') event.preventDefault();
      }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        bgcolor: onImage.backdrop,
        cursor,
        touchAction: 'none',
        userSelect: 'none'
      }}
    >
      <Box sx={{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform }}>
        <img src={images.frame.url} alt="frame" width={width} height={height} draggable={false} style={{ display: 'block' }} />
        {lidar && lidar.kind === 'image' && overlays.lidar && (
          <img
            src={lidar.url}
            alt="lidar"
            width={width}
            height={height}
            draggable={false}
            style={{ position: 'absolute', left: 0, top: 0, opacity: 0.7, pointerEvents: 'none' }}
          />
        )}
        <canvas
          ref={radarCanvasRef}
          data-testid="radar-canvas"
          width={width}
          height={height}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        />
        {suggestionMask && (
          <canvas
            ref={suggestionCanvasRef}
            data-testid="suggestion-mask"
            width={width}
            height={height}
            style={{ position: 'absolute', left: 0, top: 0, opacity: 0.3, pointerEvents: 'none', imageRendering: 'pixelated' }}
          />
        )}
        <canvas
          ref={samCanvasRef}
          data-testid="sam-preview"
          width={width}
          height={height}
          style={{ position: 'absolute', left: 0, top: 0, opacity: 0.55, pointerEvents: 'none', imageRendering: 'pixelated' }}
        />
        <canvas
          ref={maskCanvasRef}
          data-testid="mask-canvas"
          width={width}
          height={height}
          style={{ position: 'absolute', left: 0, top: 0, opacity: maskOpacity, pointerEvents: 'none', imageRendering: 'pixelated' }}
        />
      </Box>

      <CanvasOverlay
        doc={doc}
        selected={selected}
        tool={tool}
        readOnly={readOnly}
        classByKey={classByKey}
        colorOf={colorOf}
        activeClass={activeClass}
        suggestionBoxes={suggestionBoxes}
        draft={draft}
        sam={sam}
        samColor={samColor}
        scale={scale}
        offsetX={offsetX}
        offsetY={offsetY}
        brushActive={brushActive}
        hover={hover}
        brushRadius={brushRadius}
      />
    </Box>
  );
};

export default EditorCanvas;
