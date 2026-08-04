import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { TaskImages } from '../types';
import { DecodedImage } from './idmapLoader';
import { MaskIndex, applyMaskCutout, buildHighlightOverlay, maskIdAtPoint } from './maskIndex';
import { Viewport, fitViewport, panBy, toImagePoint, zoomAt } from './viewport';

export interface FrameViewerProps {
  images: TaskImages;
  maskIndex: MaskIndex | null; // mask_toggle only
  layerPixels?: DecodedImage | null; // mask_toggle only: the layer, drawn cuttable
  maskScope?: ReadonlySet<number> | null; // task's own masks; null = every painted mask
  rejected: ReadonlySet<number>;
  focusedMaskId: number | null;
  layerVisibility: Record<string, boolean>;
  layerOpacity: number; // 0..1
  viewport: Viewport | null; // null → fit on first layout
  onViewportChange: (viewport: Viewport) => void;
  onToggleMask?: (maskId: number) => void;
}

const DRAG_CLICK_THRESHOLD_PX = 5;

/**
 * The full-frame viewer: frame + annotation layers composited with CSS
 * transforms, wheel zoom (cursor-anchored), pointer-drag pan, and pixel-exact
 * click→mask hit-testing via the id-map index.
 */
const FrameViewer: React.FC<FrameViewerProps> = ({
  images,
  maskIndex,
  layerPixels,
  maskScope,
  rejected,
  focusedMaskId,
  layerVisibility,
  layerOpacity,
  viewport,
  onViewportChange,
  onToggleMask
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; moved: number } | null>(null);
  // The last viewport this component produced by fitting. While the viewport is
  // still that one the labeler has not zoomed or panned, so a container resize
  // is free to re-fit; once they have, their framing is theirs to keep.
  const fittedRef = useRef<Viewport | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [hoveredMaskId, setHoveredMaskId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const imageWidth = images.frame.width || maskIndex?.width || 1;
  const imageHeight = images.frame.height || maskIndex?.height || 1;

  // Measure the container and fit the image on first layout / task change.
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
    const next = fitViewport(imageWidth, imageHeight, containerSize.width, containerSize.height);
    // Re-fitting to the size it already fits would hand the parent a new object
    // every render and spin.
    if (viewport && next.scale === viewport.scale && next.offsetX === viewport.offsetX && next.offsetY === viewport.offsetY) {
      return;
    }
    fittedRef.current = next;
    onViewportChange(next);
  }, [viewport, containerSize, imageWidth, imageHeight, onViewportChange]);

  // Redraw the highlight overlay whenever focus or hover changes. Hover is state
  // rather than a ref precisely so this runs on a mask change and not on every
  // pointer move — the rebuild walks every pixel of the id map.
  useEffect(() => {
    const canvas = highlightRef.current;
    if (!canvas || !maskIndex) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = buildHighlightOverlay(maskIndex, focusedMaskId, maskScope, hoveredMaskId);
    context.putImageData(new ImageData(overlay, maskIndex.width, maskIndex.height), 0, 0);
  }, [maskIndex, focusedMaskId, maskScope, hoveredMaskId]);

  // Repaint the annotation layer with the marked masks cut out of it.
  useEffect(() => {
    const canvas = layerRef.current;
    if (!canvas || !maskIndex || !layerPixels) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cut = applyMaskCutout(maskIndex, layerPixels.rgba, rejected);
    context.putImageData(new ImageData(cut, layerPixels.width, layerPixels.height), 0, 0);
  }, [maskIndex, layerPixels, rejected]);

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!viewport) return;
      const bounds = containerRef.current!.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      onViewportChange(zoomAt(viewport, factor, event.clientX - bounds.left, event.clientY - bounds.top));
    },
    [viewport, onViewportChange]
  );

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    setDragging(true);
    dragRef.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: 0 };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!viewport) return;
      const drag = dragRef.current;

      if (!drag) {
        // Not dragging: track which mask is under the cursor so the labeler can
        // see the click target before committing to it. React bails out when the
        // id is unchanged, so this only repaints on crossing a mask boundary.
        if (!maskIndex || !onToggleMask) return;
        const bounds = containerRef.current!.getBoundingClientRect();
        const point = toImagePoint(viewport, event.clientX - bounds.left, event.clientY - bounds.top);
        setHoveredMaskId(maskIdAtPoint(maskIndex, point.x, point.y, maskScope));
        return;
      }

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > DRAG_CLICK_THRESHOLD_PX) {
        onViewportChange(panBy(viewport, dx, dy));
      }
    },
    [viewport, onViewportChange, maskIndex, maskScope, onToggleMask]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (!drag || drag.moved > DRAG_CLICK_THRESHOLD_PX) return; // it was a pan
      if (!viewport || !maskIndex || !onToggleMask) return;
      const bounds = containerRef.current!.getBoundingClientRect();
      const point = toImagePoint(viewport, event.clientX - bounds.left, event.clientY - bounds.top);
      const maskId = maskIdAtPoint(maskIndex, point.x, point.y, maskScope);
      if (maskId !== null) {
        onToggleMask(maskId);
      }
    },
    [viewport, maskIndex, maskScope, onToggleMask]
  );

  const transform = viewport
    ? `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`
    : undefined;

  // Cutting needs both halves: the id map to say which pixels belong to which
  // mask, and the layer's own pixels to erase from. Without either, the layer
  // renders as a plain image and marking simply has no visual effect on it.
  const cuttable = Boolean(maskIndex && layerPixels && images.layers.length > 0);

  return (
    <Box
      ref={containerRef}
      data-testid="frame-viewer"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoveredMaskId(null)}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        bgcolor: '#0b0f19',
        // A grab hand hides the pixel it is over, which is the one being judged:
        // masks here go down to a few pixels. Crosshair while picking, hand only
        // while actually panning.
        cursor: dragging ? 'grabbing' : onToggleMask ? 'crosshair' : 'grab',
        touchAction: 'none',
        userSelect: 'none'
      }}
    >
      <Box sx={{ position: 'absolute', transformOrigin: '0 0', transform }}>
        <img src={images.frame.url} alt="frame" width={imageWidth} height={imageHeight} draggable={false} style={{ display: 'block' }} />
        {images.layers
          .filter((layer) => layerVisibility[layer.set] !== false)
          .map((layer) =>
            // A mask_toggle layer is drawn from its decoded pixels so marked
            // masks can be cut out of it; every other layer is just an image.
            cuttable && layer.set === images.layers[0].set ? (
              <canvas
                key={layer.set}
                ref={layerRef}
                data-testid="layer-canvas"
                width={layerPixels!.width}
                height={layerPixels!.height}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: imageWidth,
                  height: imageHeight,
                  opacity: layerOpacity,
                  pointerEvents: 'none'
                }}
              />
            ) : (
              <img
                key={layer.set}
                src={layer.url}
                alt={`layer ${layer.set}`}
                width={imageWidth}
                height={imageHeight}
                draggable={false}
                style={{ position: 'absolute', left: 0, top: 0, opacity: layerOpacity, pointerEvents: 'none' }}
              />
            )
          )}
        {maskIndex && (
          <canvas
            ref={highlightRef}
            data-testid="highlight-canvas"
            width={maskIndex.width}
            height={maskIndex.height}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
          />
        )}
      </Box>
    </Box>
  );
};

export default FrameViewer;
