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

  it('fits the viewport on first layout when none is set', () => {
    const props = baseProps();
    props.viewport = null;
    render(<FrameViewer {...props} />);

    expect(props.onViewportChange).toHaveBeenCalled(); // fit computed from container
  });
});
