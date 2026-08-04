import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameViewer, { FrameViewerProps } from './FrameViewer';
import { buildMaskIndex } from './maskIndex';

// 2×2: [bg, mask0; mask1, mask2]
const maskIndex = buildMaskIndex(
  new Uint8ClampedArray([0, 0, 0, 255, 1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255]),
  2,
  2
);

const putImageData = vi.fn();

const baseProps = (): FrameViewerProps => ({
  images: {
    frame: { url: 'frame.png', width: 2, height: 2 },
    layers: [
      { set: 'a', url: 'layer-a.png' },
      { set: 'b', url: 'layer-b.png' },
    ],
    idmap: { url: 'idmap.png' },
  },
  maskIndex,
  rejected: new Set<number>(),
  focusedMaskId: null,
  layerVisibility: {},
  layerOpacity: 0.5,
  viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  onViewportChange: vi.fn(),
  onToggleMask: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});

describe('FrameViewer', () => {
  it('renders the frame and visible layers with opacity', () => {
    const props = baseProps();
    props.layerVisibility = { b: false };
    render(<FrameViewer {...props} />);

    expect(screen.getByAltText('frame')).toBeInTheDocument();
    expect(screen.getByAltText('layer a')).toHaveStyle({ opacity: '0.5' });
    expect(screen.queryByAltText('layer b')).not.toBeInTheDocument();
    expect(screen.getByTestId('highlight-canvas')).toBeInTheDocument();
    expect(putImageData).toHaveBeenCalled(); // highlight overlay drawn
  });

  it('zooms on wheel around the cursor', () => {
    const props = baseProps();
    render(<FrameViewer {...props} />);

    fireEvent.wheel(screen.getByTestId('frame-viewer'), { deltaY: -1, clientX: 10, clientY: 10 });

    expect(props.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ scale: expect.closeTo(1.2, 5) })
    );
  });

  it('pans on drag without toggling a mask', () => {
    const props = baseProps();
    render(<FrameViewer {...props} />);
    const viewer = screen.getByTestId('frame-viewer');

    fireEvent.pointerDown(viewer, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(viewer, { clientX: 30, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(viewer, { clientX: 30, clientY: 0, pointerId: 1 });

    expect(props.onViewportChange).toHaveBeenCalledWith(expect.objectContaining({ offsetX: 30 }));
    expect(props.onToggleMask).not.toHaveBeenCalled();
  });

  it('click (no drag) toggles the mask under the cursor', () => {
    const props = baseProps();
    render(<FrameViewer {...props} />);
    const viewer = screen.getByTestId('frame-viewer');

    // (1, 0) in image space = mask 0
    fireEvent.pointerDown(viewer, { clientX: 1.5, clientY: 0.5, pointerId: 1 });
    fireEvent.pointerUp(viewer, { clientX: 1.5, clientY: 0.5, pointerId: 1 });

    expect(props.onToggleMask).toHaveBeenCalledWith(0);
  });

  it('ignores background clicks', () => {
    const props = baseProps();
    render(<FrameViewer {...props} />);
    const viewer = screen.getByTestId('frame-viewer');

    fireEvent.pointerDown(viewer, { clientX: 0.2, clientY: 0.2, pointerId: 1 });
    fireEvent.pointerUp(viewer, { clientX: 0.2, clientY: 0.2, pointerId: 1 });

    expect(props.onToggleMask).not.toHaveBeenCalled();
  });

  // Masks go down to a few pixels, so "which one am I about to click" has to be
  // answered before the click, not after it.
  it('lights the mask under the cursor and clears it on leave', () => {
    render(<FrameViewer {...baseProps()} />);
    const viewer = screen.getByTestId('frame-viewer');
    const repaints = putImageData.mock.calls.length;

    fireEvent.pointerMove(viewer, { clientX: 1.5, clientY: 0.5, pointerId: 1 });
    expect(putImageData.mock.calls.length).toBeGreaterThan(repaints);

    // Same mask under the cursor — no state change, so no repaint.
    const afterHover = putImageData.mock.calls.length;
    fireEvent.pointerMove(viewer, { clientX: 1.9, clientY: 0.9, pointerId: 1 });
    expect(putImageData.mock.calls.length).toBe(afterHover);

    fireEvent.pointerLeave(viewer);
    expect(putImageData.mock.calls.length).toBeGreaterThan(afterHover);
  });

  it('uses a crosshair while picking masks and a hand while panning', () => {
    const props = baseProps();
    const { rerender } = render(<FrameViewer {...props} />);
    const viewer = screen.getByTestId('frame-viewer');
    expect(getComputedStyle(viewer).cursor).toBe('crosshair');

    fireEvent.pointerDown(viewer, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(getComputedStyle(viewer).cursor).toBe('grabbing');
    fireEvent.pointerUp(viewer, { clientX: 0, clientY: 0, pointerId: 1 });

    // A job with nothing to click is pan-only, so the hand stays.
    rerender(<FrameViewer {...props} onToggleMask={undefined} />);
    expect(getComputedStyle(screen.getByTestId('frame-viewer')).cursor).toBe('grab');
  });

  it('fits the viewport on first layout when none is set', () => {
    const props = baseProps();
    props.viewport = null;
    render(<FrameViewer {...props} />);

    expect(props.onViewportChange).toHaveBeenCalled(); // fit computed from container
  });

  // Whoever framed the image last owns the framing: the viewer re-fits a window
  // resize it fitted itself, and leaves a zoom the labeler chose alone.
  it('re-fits after a resize, but never over a viewport the labeler set', () => {
    const props = baseProps();
    props.viewport = null;
    const { rerender } = render(<FrameViewer {...props} />);

    const fitted = (props.onViewportChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
    (props.onViewportChange as ReturnType<typeof vi.fn>).mockClear();

    // Same container size, viewport already fitted → nothing to do.
    rerender(<FrameViewer {...props} viewport={fitted} />);
    expect(props.onViewportChange).not.toHaveBeenCalled();

    // A viewport the labeler zoomed to is not the fitted one, so it survives a
    // re-render that would otherwise re-fit.
    rerender(<FrameViewer {...props} viewport={{ scale: 9, offsetX: 3, offsetY: 4 }} />);
    expect(props.onViewportChange).not.toHaveBeenCalled();
  });

  it('draws the mask layer through a canvas so marked masks can be cut out', () => {
    const props = baseProps();
    props.layerPixels = { width: 2, height: 2, rgba: new Uint8ClampedArray(16).fill(255) };
    const { rerender } = render(<FrameViewer {...props} />);

    // Layer 'a' owns the id map, so it becomes a canvas; 'b' stays an image.
    expect(screen.getByTestId('layer-canvas')).toBeInTheDocument();
    expect(screen.queryByAltText('layer a')).not.toBeInTheDocument();
    expect(screen.getByAltText('layer b')).toBeInTheDocument();

    const before = putImageData.mock.calls.length;
    rerender(<FrameViewer {...props} rejected={new Set([1])} />);
    expect(putImageData.mock.calls.length).toBeGreaterThan(before); // layer repainted
  });

  it('leaves the layer as a plain image when its pixels are unavailable', () => {
    render(<FrameViewer {...baseProps()} layerPixels={null} />);

    expect(screen.queryByTestId('layer-canvas')).not.toBeInTheDocument();
    expect(screen.getByAltText('layer a')).toBeInTheDocument();
  });
});
