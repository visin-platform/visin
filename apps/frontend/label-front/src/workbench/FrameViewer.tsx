import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { TaskImages } from '../types';
import { MaskIndex, buildHighlightOverlay, maskIdAtPoint } from './maskIndex';
import { Viewport, fitViewport, panBy, toImagePoint, zoomAt } from './viewport';

export interface FrameViewerProps {
  images: TaskImages;
  maskIndex: MaskIndex | null; // mask_toggle only
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
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; moved: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

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
    if (!viewport && containerSize) {
      onViewportChange(fitViewport(imageWidth, imageHeight, containerSize.width, containerSize.height));
    }
  }, [viewport, containerSize, imageWidth, imageHeight, onViewportChange]);

  // Redraw the highlight overlay whenever the selection or focus changes.
  useEffect(() => {
    const canvas = highlightRef.current;
    if (!canvas || !maskIndex) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const overlay = buildHighlightOverlay(maskIndex, rejected, focusedMaskId);
    context.putImageData(new ImageData(overlay, maskIndex.width, maskIndex.height), 0, 0);
  }, [maskIndex, rejected, focusedMaskId]);

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
    dragRef.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: 0 };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !viewport) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > DRAG_CLICK_THRESHOLD_PX) {
        onViewportChange(panBy(viewport, dx, dy));
      }
    },
    [viewport, onViewportChange]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved > DRAG_CLICK_THRESHOLD_PX) return; // it was a pan
      if (!viewport || !maskIndex || !onToggleMask) return;
      const bounds = containerRef.current!.getBoundingClientRect();
      const point = toImagePoint(viewport, event.clientX - bounds.left, event.clientY - bounds.top);
      const maskId = maskIdAtPoint(maskIndex, point.x, point.y);
      if (maskId !== null) {
        onToggleMask(maskId);
      }
    },
    [viewport, maskIndex, onToggleMask]
  );

  const transform = viewport
    ? `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`
    : undefined;

  return (
    <Box
      ref={containerRef}
      data-testid="frame-viewer"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        bgcolor: '#0b0f19',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none'
      }}
    >
      <Box sx={{ position: 'absolute', transformOrigin: '0 0', transform }}>
        <img src={images.frame.url} alt="frame" width={imageWidth} height={imageHeight} draggable={false} style={{ display: 'block' }} />
        {images.layers
          .filter((layer) => layerVisibility[layer.set] !== false)
          .map((layer) => (
            <img
              key={layer.set}
              src={layer.url}
              alt={`layer ${layer.set}`}
              width={imageWidth}
              height={imageHeight}
              draggable={false}
              style={{ position: 'absolute', left: 0, top: 0, opacity: layerOpacity, pointerEvents: 'none' }}
            />
          ))}
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
