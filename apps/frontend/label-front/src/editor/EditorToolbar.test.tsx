import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EditorToolbar, { EditorToolbarProps } from './EditorToolbar';
import { classHotkey } from './classHotkey';
import { EditorDocument } from './EditorDocument';
import { box, carClass, roadClass, signClass } from '../test/fixtures';

const setup = (overrides: Partial<EditorToolbarProps> = {}) => {
  const props: EditorToolbarProps = {
    doc: new EditorDocument(100, 100),
    classes: [carClass, roadClass, signClass],
    colorOf: (entry) => entry.color,
    tool: 'box',
    onTool: vi.fn(),
    canBox: true,
    canMask: true,
    activeClassKey: 'car',
    onClass: vi.fn(),
    brushDiameter: 24,
    onBrushDiameter: vi.fn(),
    maskOpacity: 0.5,
    onMaskOpacity: vi.fn(),
    availableOverlays: { lidar: false, radar: false },
    overlays: { lidar: false, radar: false },
    onOverlays: vi.fn(),
    onFit: vi.fn(),
    disabled: false,
    model: {
      status: 'off',
      label: 'Model',
      canDetect: false,
      canSegment: false,
      detecting: false,
      onDetect: vi.fn(),
      onOpen: vi.fn()
    },
    ...overrides
  };
  render(<EditorToolbar {...props} />);
  return props;
};

describe('classHotkey', () => {
  it('uses the hotkey a class has, else its position up to nine', () => {
    expect(classHotkey({ ...carClass, hotkey: 'c' }, 4)).toBe('c');
    expect(classHotkey({ ...carClass, hotkey: undefined }, 2)).toBe('3');
    expect(classHotkey({ ...carClass, hotkey: undefined }, 9)).toBeUndefined();
  });
});

describe('EditorToolbar and the model', () => {
  const model = (overrides: Partial<EditorToolbarProps['model']> = {}): EditorToolbarProps['model'] => ({
    status: 'connected',
    label: 'Model · RTX 4070',
    canDetect: true,
    canSegment: true,
    detecting: false,
    onDetect: vi.fn(),
    onOpen: vi.fn(),
    ...overrides
  });

  it('shows the model chip, opens the dialog from it, and offers Detect and Segment when it can', () => {
    const props = setup({ model: model() });

    fireEvent.click(screen.getByRole('button', { name: 'model' }));
    expect(props.model.onOpen).toHaveBeenCalled();
    expect(screen.getByText('Model · RTX 4070')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Detect' }));
    expect(props.model.onDetect).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'segment tool' }));
    expect(props.onTool).toHaveBeenCalledWith('sam');
  });

  it('offers neither without a model, but always the way to set one up', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Detect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'segment tool' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'model' })).toBeInTheDocument();
  });

  it('shows detection in progress, and cannot start it again meanwhile', () => {
    setup({ model: model({ detecting: true }) });
    expect(screen.getByRole('button', { name: 'Detecting…' })).toBeDisabled();
  });

  it('marks a model that cannot be reached', () => {
    setup({ model: model({ status: 'unreachable', label: 'Model · not reachable', canDetect: false, canSegment: false }) });
    expect(screen.getByText('Model · not reachable')).toBeInTheDocument();
  });

  it('disables the segment tool when the job has no mask class', () => {
    setup({ model: model(), canMask: false });
    expect(screen.getByRole('button', { name: 'segment tool' })).toBeDisabled();
  });
});

describe('EditorToolbar', () => {
  it('shows each class with its hotkey, the active one pressed, and picks a class on click', () => {
    const props = setup();

    expect(screen.getByRole('button', { name: '1 Car' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2 Road' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '3 Sign' }));
    expect(props.onClass).toHaveBeenCalledWith('sign');
  });

  it('switches tools, and disables the ones the job’s classes cannot use', () => {
    const props = setup({ canBox: false, tool: 'brush' });

    expect(screen.getByRole('button', { name: 'box tool' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'eraser tool' }));
    expect(props.onTool).toHaveBeenCalledWith('eraser');
  });

  it('does not unselect a tool by clicking it again', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'box tool' }));
    expect(props.onTool).not.toHaveBeenCalled();
  });

  it('reports changes to the brush size and the mask opacity', () => {
    const props = setup({ tool: 'brush' });

    fireEvent.change(screen.getByLabelText('brush size'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('mask opacity'), { target: { value: '0.8' } });

    expect(props.onBrushDiameter).toHaveBeenCalledWith(60);
    expect(props.onMaskOpacity).toHaveBeenCalledWith(0.8);
  });

  it('offers brush size only while painting, and mask opacity only when masks exist', () => {
    const box = setup({ tool: 'box' });
    expect(screen.queryByLabelText('brush size')).not.toBeInTheDocument();
    expect(screen.getByLabelText('mask opacity')).toBeInTheDocument();
    expect(box.canMask).toBe(true);
  });

  it('shows brush size for the brush and eraser', () => {
    setup({ tool: 'eraser' });
    expect(screen.getByLabelText('brush size')).toBeInTheDocument();
  });

  it('has no mask controls on a boxes-only job', () => {
    setup({ canMask: false });
    expect(screen.queryByLabelText('mask opacity')).not.toBeInTheDocument();
  });

  it('offers only the sensors the frame has, and reports the combination chosen', () => {
    const props = setup({ availableOverlays: { lidar: true, radar: false } });

    expect(screen.queryByRole('button', { name: 'show radar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'show lidar' }));
    expect(props.onOverlays).toHaveBeenCalledWith({ lidar: true, radar: false });
  });

  it('turns an overlay off again', () => {
    const props = setup({
      availableOverlays: { lidar: true, radar: true },
      overlays: { lidar: true, radar: true }
    });

    fireEvent.click(screen.getByRole('button', { name: 'show lidar' }));

    expect(props.onOverlays).toHaveBeenCalledWith({ lidar: false, radar: true });
  });

  it('wires undo, redo and fit, enabling undo and redo only when there is history', () => {
    const idle = setup();
    expect(screen.getByRole('button', { name: 'undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'redo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'fit frame' }));
    expect(idle.onFit).toHaveBeenCalled();
  });

  it('enables undo and redo as work is done, and acts on the document', () => {
    const { doc } = setup();
    expect(screen.getByRole('button', { name: 'undo' })).toBeDisabled();

    act(() => doc.addBox(box('a')));
    expect(screen.getByRole('button', { name: 'undo' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(doc.boxes).toEqual([]);
    expect(screen.getByRole('button', { name: 'redo' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(doc.boxes).toHaveLength(1);
  });

  it('disables the controls while a frame is changing', () => {
    const { doc } = setup({ disabled: true });
    act(() => doc.addBox(box('a')));
    expect(screen.getByRole('button', { name: '1 Car' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'undo' })).toBeDisabled();
  });
});
