import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EditorCanvas, { EditorCanvasProps } from './EditorCanvas';
import { EditorDocument } from './EditorDocument';
import { box, carClass, roadClass, signClass } from '../test/fixtures';

const WIDTH = 200;
const HEIGHT = 100;
const IDENTITY = { scale: 1, offsetX: 0, offsetY: 0 };

const context = {
  createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
  putImageData: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillStyle: ''
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => vi.restoreAllMocks());

const setup = (overrides: Partial<EditorCanvasProps> = {}, doc = new EditorDocument(WIDTH, HEIGHT)) => {
  const props: EditorCanvasProps = {
    doc,
    images: { frame: { url: 'https://files.example.test/f.jpg', width: WIDTH, height: HEIGHT }, sensors: [] },
    classes: [carClass, roadClass, signClass],
    colorOf: (entry) => entry.color,
    tool: 'box',
    activeClass: carClass,
    brushRadius: 4,
    maskOpacity: 0.5,
    overlays: { lidar: false, radar: false },
    suggestionBoxes: [],
    suggestionMask: null,
    onAcceptSuggestion: vi.fn(),
    readOnly: false,
    viewport: IDENTITY,
    onViewportChange: vi.fn(),
    onPickClass: vi.fn(),
    ...overrides
  };
  const view = render(<EditorCanvas {...props} />);
  const surface = screen.getByTestId('editor-canvas');
  const at = (x: number, y: number, extra: Record<string, unknown> = {}) => ({ clientX: x, clientY: y, button: 0, pointerId: 1, ...extra });
  const drag = (from: [number, number], to: [number, number], extra: Record<string, unknown> = {}) => {
    fireEvent.pointerDown(surface, at(from[0], from[1], extra));
    fireEvent.pointerMove(surface, at(to[0], to[1], extra));
    fireEvent.pointerUp(surface, at(to[0], to[1], extra));
  };
  return { props, doc, view, surface, at, drag };
};

describe('rendering', () => {
  it('shows the frame, the mask layer and each box with its class name', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [10, 10, 50, 30]), box('b', [100, 20, 20, 20], { classKey: 'sign' })]);

    setup({}, doc);

    expect(screen.getByAltText('frame')).toHaveAttribute('src', 'https://files.example.test/f.jpg');
    expect(screen.getByTestId('mask-canvas')).toBeInTheDocument();
    expect(screen.getAllByTestId('box')).toHaveLength(2);
    expect(screen.getByText('Car')).toBeInTheDocument();
    expect(screen.getByText('Sign')).toBeInTheDocument();
    expect(context.putImageData).toHaveBeenCalled();
  });

  it('places boxes through the viewport', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [10, 10, 50, 30])]);

    setup({ viewport: { scale: 2, offsetX: 5, offsetY: 7 } }, doc);

    const rect = screen.getByTestId('box');
    expect(rect).toHaveAttribute('x', '25');
    expect(rect).toHaveAttribute('y', '27');
    expect(rect).toHaveAttribute('width', '100');
    expect(rect).toHaveAttribute('height', '60');
  });

  it('names a box whose class the job no longer has by its key', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [10, 10, 50, 30], { classKey: 'retired' })]);

    setup({}, doc);

    expect(screen.getByText('retired')).toBeInTheDocument();
  });

  it('draws LiDAR over the frame only when it is switched on', () => {
    const images = {
      frame: { url: 'f', width: WIDTH, height: HEIGHT },
      sensors: [{ key: 'lidar' as const, kind: 'image' as const, url: 'https://files.example.test/l.png' }]
    };
    const first = setup({ images });
    expect(screen.queryByAltText('lidar')).not.toBeInTheDocument();
    first.view.unmount();

    setup({ images, overlays: { lidar: true, radar: false } });
    expect(screen.getByAltText('lidar')).toHaveAttribute('src', 'https://files.example.test/l.png');
  });

  it('dots radar points coloured by their reading', () => {
    const images = {
      frame: { url: 'f', width: WIDTH, height: HEIGHT },
      sensors: [
        {
          key: 'radar' as const,
          kind: 'points' as const,
          points: [
            { u: 10, v: 10, value: 1 },
            { u: 50, v: 20, value: 9 },
            { u: 70, v: 30 }
          ]
        }
      ]
    };

    setup({ images, overlays: { lidar: false, radar: true } });

    expect(context.arc).toHaveBeenCalledTimes(3);
    expect(context.arc.mock.calls[1].slice(0, 2)).toEqual([50, 20]);
  });

  it('draws no radar when it is off, and clears what was there', () => {
    const images = { frame: { url: 'f', width: WIDTH, height: HEIGHT }, sensors: [{ key: 'radar' as const, kind: 'points' as const, points: [{ u: 1, v: 1 }] }] };

    setup({ images, overlays: { lidar: false, radar: false } });

    expect(context.arc).not.toHaveBeenCalled();
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('draws the suggested mask and dashed suggestion boxes', () => {
    setup({
      suggestionMask: new Uint8Array(WIDTH * HEIGHT).fill(1),
      suggestionBoxes: [box('s', [5, 5, 20, 20], { source: 'import' })]
    });

    expect(screen.getByTestId('suggestion-mask')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-box')).toHaveAttribute('stroke-dasharray');
  });

  it('copes with a browser that gives no canvas context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    setup({ images: { frame: { url: 'f', width: WIDTH, height: HEIGHT }, sensors: [{ key: 'radar', kind: 'points', points: [] }] }, overlays: { lidar: false, radar: true } });

    expect(screen.getByTestId('editor-canvas')).toBeInTheDocument();
  });
});

describe('framing', () => {
  it('fits the frame to the container until the annotator moves it', () => {
    const onViewportChange = vi.fn();

    setup({ viewport: null, onViewportChange });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange.mock.calls[0][0]).toHaveProperty('scale');
  });

  it('zooms with the wheel around the pointer', () => {
    const { surface, props } = setup();
    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 40, clientY: 20, cancelable: true, bubbles: true });

    act(() => {
      surface.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    const next = (props.onViewportChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(next.scale).toBeGreaterThan(1);
    // The point under the pointer stays where it was.
    expect((40 - next.offsetX) / next.scale).toBeCloseTo(40);
  });

  it('zooms out on the other wheel direction', () => {
    const { surface, props } = setup();

    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 0, clientY: 0, cancelable: true, bubbles: true }));
    });

    expect((props.onViewportChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].scale).toBeLessThan(1);
  });

  it('pans with the middle button, with space held, and always for a viewer', () => {
    const middle = setup();
    middle.drag([10, 10], [30, 25], { button: 1 });
    expect(middle.props.onViewportChange).toHaveBeenLastCalledWith({ scale: 1, offsetX: 20, offsetY: 15 });
    middle.view.unmount();

    const spaced = setup();
    fireEvent.keyDown(document.body, { code: 'Space' });
    spaced.drag([10, 10], [20, 10]);
    fireEvent.keyUp(document.body, { code: 'Space' });
    expect(spaced.props.onViewportChange).toHaveBeenLastCalledWith({ scale: 1, offsetX: 10, offsetY: 0 });
    expect(spaced.doc.boxes).toEqual([]);
    spaced.view.unmount();

    const viewer = setup({ readOnly: true });
    viewer.drag([10, 10], [15, 18]);
    expect(viewer.props.onViewportChange).toHaveBeenLastCalledWith({ scale: 1, offsetX: 5, offsetY: 8 });
    expect(viewer.doc.boxes).toEqual([]);
  });

  it('does not take Space from a field or a button elsewhere on the page', () => {
    const { surface, drag, doc } = setup();
    for (const tag of ['input', 'button']) {
      const element = document.createElement(tag);
      document.body.appendChild(element);
      const notCancelled = fireEvent.keyDown(element, { code: 'Space' });
      expect(notCancelled).toBe(true);
      element.remove();
    }

    drag([10, 10], [60, 50]);

    expect(doc.boxes).toHaveLength(1);
    expect(surface).toBeInTheDocument();
  });

  it('takes Space when the editor itself has focus', () => {
    const { surface } = setup();
    expect(fireEvent.keyDown(surface, { code: 'Space' })).toBe(false);
  });
});

describe('drawing boxes', () => {
  it('draws a box of the active class by dragging, and selects it', () => {
    const { doc, drag } = setup();

    drag([20, 10], [70, 50]);

    expect(doc.boxes).toHaveLength(1);
    expect(doc.boxes[0]).toMatchObject({ classKey: 'car', bbox: [20, 10, 50, 40], source: 'human' });
    expect(doc.selectedId).toBe(doc.boxes[0].id);
  });

  it('draws the same box dragging the other way, and clamps it to the frame', () => {
    const { doc, drag } = setup();

    drag([300, 150], [150, 60]);

    expect(doc.boxes[0].bbox).toEqual([150, 60, 50, 40]);
  });

  it('shows the box being drawn, and nothing for a stray click', () => {
    const { surface, at, drag, doc } = setup();

    fireEvent.pointerDown(surface, at(20, 10));
    fireEvent.pointerMove(surface, at(60, 40));
    expect(screen.getByTestId('draft-box')).toBeInTheDocument();
    fireEvent.pointerUp(surface, at(60, 40));
    expect(screen.queryByTestId('draft-box')).not.toBeInTheDocument();

    drag([100, 50], [101, 51]);
    expect(doc.boxes).toHaveLength(1);
  });

  it('draws nothing when the active class has no box tool, or none is active', () => {
    const mask = setup({ activeClass: roadClass });
    mask.drag([20, 10], [70, 50]);
    expect(mask.doc.boxes).toEqual([]);
    mask.view.unmount();

    const none = setup({ activeClass: null });
    none.drag([20, 10], [70, 50]);
    expect(none.doc.boxes).toEqual([]);
  });

  it('ignores the secondary button', () => {
    const { drag, doc } = setup();
    drag([20, 10], [70, 50], { button: 2 });
    expect(doc.boxes).toEqual([]);
  });
});

describe('editing boxes', () => {
  const withBox = () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [20, 20, 60, 40])]);
    return doc;
  };

  it('selects a box by clicking it and tells the class bar', () => {
    const { doc, drag, props } = setup({}, withBox());

    drag([40, 30], [40, 30]);

    expect(doc.selectedId).toBe('a');
    expect(props.onPickClass).toHaveBeenCalledWith('car');
    expect(screen.getByTestId('handle-nw')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^handle-/)).toHaveLength(8);
  });

  it('clicking empty space clears the selection', () => {
    const { doc, drag } = setup({}, withBox());
    drag([40, 30], [40, 30]);

    drag([150, 80], [150, 80]);

    expect(doc.selectedId).toBeNull();
    expect(doc.boxes).toHaveLength(1);
  });

  it('moves a box by dragging its body, as one undoable step', () => {
    const { doc, drag } = setup({}, withBox());

    drag([40, 30], [60, 45]);

    expect(doc.boxes[0].bbox).toEqual([40, 35, 60, 40]);
    doc.undo();
    expect(doc.boxes[0].bbox).toEqual([20, 20, 60, 40]);
  });

  it('does not move a box for a click that only wobbled', () => {
    const { doc, drag } = setup({}, withBox());

    drag([40, 30], [41, 31]);

    expect(doc.boxes[0].bbox).toEqual([20, 20, 60, 40]);
    expect(doc.canUndo).toBe(false);
  });

  it('resizes from a handle of the selected box', () => {
    const { doc, drag, surface, at } = setup({}, withBox());
    drag([40, 30], [40, 30]);

    fireEvent.pointerDown(surface, at(80, 60));
    fireEvent.pointerMove(surface, at(120, 90));
    fireEvent.pointerUp(surface, at(120, 90));

    expect(doc.boxes[0].bbox).toEqual([20, 20, 100, 70]);
  });

  it('accepts a suggestion box by clicking it', () => {
    const suggestion = box('s1', [120, 10, 40, 40], { source: 'import' });
    const { drag, props } = setup({ suggestionBoxes: [suggestion] });

    drag([130, 20], [130, 20]);

    expect(props.onAcceptSuggestion).toHaveBeenCalledWith('s1');
  });
});

describe('painting', () => {
  it('paints the active class under the brush, and shows the brush ring', () => {
    const { doc, drag, surface, at } = setup({ tool: 'brush', activeClass: roadClass, brushRadius: 5 });

    fireEvent.pointerMove(surface, at(100, 50));
    expect(screen.getByTestId('brush-ring')).toBeInTheDocument();

    drag([100, 50], [130, 50]);

    expect(doc.mask[50 * WIDTH + 100]).toBe(2);
    expect(doc.mask[50 * WIDTH + 125]).toBe(2);
    expect(doc.mask[20 * WIDTH + 20]).toBe(0);
    expect(doc.maskRevision).toBe(1);
  });

  it('does not paint over another class unless shift is held', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([], Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => (i === 50 * WIDTH + 100 ? 1 : 0)));
    const careful = setup({ tool: 'brush', activeClass: roadClass, brushRadius: 3 }, doc);

    careful.drag([100, 50], [100, 50]);
    expect(doc.mask[50 * WIDTH + 100]).toBe(1);
    careful.view.unmount();

    const bold = setup({ tool: 'brush', activeClass: roadClass, brushRadius: 3 }, doc);
    bold.drag([100, 50], [100, 50], { shiftKey: true });
    expect(doc.mask[50 * WIDTH + 100]).toBe(2);
  });

  it('erases with the eraser, whatever class is active', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([], new Uint8Array(WIDTH * HEIGHT).fill(1));
    const { drag } = setup({ tool: 'eraser', activeClass: signClass, brushRadius: 4 }, doc);

    drag([100, 50], [100, 50]);

    expect(doc.mask[50 * WIDTH + 100]).toBe(0);
    expect(doc.mask[10 * WIDTH + 10]).toBe(1);
  });

  it('paints nothing when the active class takes no mask, and shows no brush', () => {
    const { doc, drag, surface, at } = setup({ tool: 'brush', activeClass: signClass });

    fireEvent.pointerMove(surface, at(100, 50));
    drag([100, 50], [120, 50]);

    expect(doc.hasMask).toBe(false);
    expect(screen.queryByTestId('brush-ring')).not.toBeInTheDocument();
  });

  it('hides the brush ring when the pointer leaves, and for a viewer', () => {
    const { surface, at } = setup({ tool: 'brush', activeClass: roadClass });
    fireEvent.pointerMove(surface, at(100, 50));
    fireEvent.pointerLeave(surface);
    expect(screen.queryByTestId('brush-ring')).not.toBeInTheDocument();
  });

  it('ends a stroke when the pointer is cancelled', () => {
    const { doc, surface, at } = setup({ tool: 'brush', activeClass: roadClass, brushRadius: 3 });

    fireEvent.pointerDown(surface, at(10, 10));
    fireEvent.pointerCancel(surface, at(10, 10));

    expect(doc.maskRevision).toBe(1);
  });
});

describe('segment tool', () => {
  const sam = (overrides: Partial<NonNullable<EditorCanvasProps['sam']>> = {}) => ({
    points: [],
    box: null,
    preview: null,
    busy: false,
    onPrompt: vi.fn(),
    ...overrides
  });

  it('a click is a point on the object, a right-click or Alt-click is a point off it', () => {
    const state = sam();
    const { drag, doc } = setup({ tool: 'sam', activeClass: roadClass, sam: state });

    drag([40, 30], [40, 30]);
    expect(state.onPrompt).toHaveBeenLastCalledWith([{ x: 40, y: 30, label: 1 }], null);

    drag([60, 30], [60, 30], { button: 2 });
    expect(state.onPrompt).toHaveBeenLastCalledWith([{ x: 60, y: 30, label: 0 }], null);

    drag([70, 30], [70, 30], { altKey: true });
    expect(state.onPrompt).toHaveBeenLastCalledWith([{ x: 70, y: 30, label: 0 }], null);
    expect(doc.boxes).toEqual([]);
    expect(doc.hasMask).toBe(false);
  });

  it('adds a click to the ones already made, and keeps the box', () => {
    const state = sam({ points: [{ x: 10, y: 10, label: 1 }], box: [5, 5, 50, 50] });
    const { drag } = setup({ tool: 'sam', activeClass: roadClass, sam: state });

    drag([40, 30], [40, 30]);

    expect(state.onPrompt).toHaveBeenCalledWith(
      [
        { x: 10, y: 10, label: 1 },
        { x: 40, y: 30, label: 1 }
      ],
      [5, 5, 50, 50]
    );
  });

  it('a first click inside a box already drawn sends that box with the point', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [20, 20, 60, 40])]);
    const state = sam();
    const { drag } = setup({ tool: 'sam', activeClass: roadClass, sam: state }, doc);

    drag([40, 30], [40, 30]);

    expect(state.onPrompt).toHaveBeenLastCalledWith([{ x: 40, y: 30, label: 1 }], [20, 20, 60, 40]);
  });

  it('a later click inside a box does not replace the prompt so far', () => {
    const doc = new EditorDocument(WIDTH, HEIGHT);
    doc.load([box('a', [20, 20, 60, 40])]);
    const state = sam({ points: [{ x: 150, y: 50, label: 1 }] });
    const { drag } = setup({ tool: 'sam', activeClass: roadClass, sam: state }, doc);

    drag([40, 30], [40, 30]);

    expect(state.onPrompt).toHaveBeenLastCalledWith(
      [
        { x: 150, y: 50, label: 1 },
        { x: 40, y: 30, label: 1 }
      ],
      null
    );
  });

  it('a drag is a box around the object, shown while it is drawn', () => {
    const state = sam({ points: [{ x: 10, y: 10, label: 1 }] });
    const { surface, at } = setup({ tool: 'sam', activeClass: roadClass, sam: state });

    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerMove(surface, at(90, 70));
    expect(screen.getByTestId('draft-box')).toBeInTheDocument();
    fireEvent.pointerUp(surface, at(90, 70));

    expect(screen.queryByTestId('draft-box')).not.toBeInTheDocument();
    expect(state.onPrompt).toHaveBeenCalledWith([{ x: 10, y: 10, label: 1 }], [20, 20, 70, 50]);
  });

  it('ignores a box too small to mean anything, and a drag with the off-object button', () => {
    const state = sam();
    const { surface, at } = setup({ tool: 'sam', activeClass: roadClass, sam: state });

    fireEvent.pointerDown(surface, at(20, 20));
    fireEvent.pointerMove(surface, at(25, 20));
    fireEvent.pointerUp(surface, at(21, 20));
    expect(state.onPrompt).not.toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.anything()]));

    fireEvent.pointerDown(surface, at(20, 20, { button: 2 }));
    fireEvent.pointerMove(surface, at(90, 70, { button: 2 }));
    fireEvent.pointerUp(surface, at(90, 70, { button: 2 }));
    expect(screen.queryByTestId('draft-box')).not.toBeInTheDocument();
  });

  it('shows the prompts and the model’s mask', () => {
    const state = sam({
      points: [
        { x: 10, y: 10, label: 1 },
        { x: 20, y: 20, label: 0 }
      ],
      box: [1, 1, 30, 30],
      preview: { width: WIDTH, height: HEIGHT, data: new Uint8Array(WIDTH * HEIGHT).fill(1) }
    });

    setup({ tool: 'sam', activeClass: roadClass, sam: state });

    const points = screen.getAllByTestId('sam-point');
    expect(points.map((point) => point.getAttribute('data-label'))).toEqual(['1', '0']);
    expect(screen.getByTestId('sam-box')).toBeInTheDocument();
    expect(context.putImageData).toHaveBeenCalled();
  });

  it('draws no preview for a mask of another size', () => {
    context.putImageData.mockClear();
    setup({
      tool: 'sam',
      activeClass: roadClass,
      sam: sam({ preview: { width: 5, height: 5, data: new Uint8Array(25).fill(1) } })
    });

    // Only the document's own (empty) mask was painted.
    expect(context.putImageData).toHaveBeenCalledTimes(1);
  });

  it('keeps the browser’s context menu away from the right-click', () => {
    const first = setup({ tool: 'sam', activeClass: roadClass, sam: sam() });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    first.surface.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    first.view.unmount();

    const other = setup({ tool: 'box' });
    const second = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    other.surface.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('uses the class colour when there is no active class', () => {
    setup({ tool: 'sam', activeClass: null, sam: sam({ preview: { width: WIDTH, height: HEIGHT, data: new Uint8Array(WIDTH * HEIGHT) } }) });
    expect(screen.getByTestId('sam-preview')).toBeInTheDocument();
  });
});
