import { describe, it, expect, vi } from 'vitest';
import { act, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  setModelClassMapping: vi.fn(),
}));
vi.mock('../contexts/AuthContext', async () => {
  const { authState } = await import('../test/workbenchHarness');
  return { useAuth: () => authState };
});
vi.mock('../editor/useWorkQueue', async () => {
  const { queueState } = await import('../test/workbenchHarness');
  return { useWorkQueue: vi.fn(() => queueState) };
});
vi.mock('../editor/useFrameDocument', async () => {
  const { frameState } = await import('../test/workbenchHarness');
  return { useFrameDocument: vi.fn(() => frameState) };
});
vi.mock('../editor/EditorCanvas', async () => {
  const { FakeCanvas } = await import('../test/FakeCanvas');
  return { default: FakeCanvas };
});
vi.mock('../localModel/useLocalModel', async () => {
  const { modelState } = await import('../test/workbenchHarness');
  return { useLocalModel: () => modelState };
});

import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { box, makeItem } from '../test/fixtures';
import { queueState, doc, acceptAll, dismiss, key, installWorkbenchHarness } from '../test/workbenchHarness';

const open = (route = '/jobs/j1/work') => renderWithProviders(<WorkbenchPage />, { route, path: '/jobs/:id/work' });

installWorkbenchHarness();

describe('keyboard', () => {
  it('picks the tool and the class', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('p');
    expect(canvas).toHaveAttribute('data-tool', 'brush');
    // Road is the first class that takes a mask... car takes both, and was already active.
    expect(canvas).toHaveAttribute('data-class', 'car');
    key('2');
    expect(canvas).toHaveAttribute('data-class', 'road');
    key('e');
    expect(canvas).toHaveAttribute('data-tool', 'eraser');
    key('b');
    // Road has no box tool, so the box tool picks the first class that does.
    expect(canvas).toHaveAttribute('data-tool', 'box');
    expect(canvas).toHaveAttribute('data-class', 'car');
  });

  it('switching to a class that does not fit the tool switches the tool', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('2'); // road: mask only, while the box tool is on
    expect(canvas).toHaveAttribute('data-tool', 'brush');
    expect(canvas).toHaveAttribute('data-class', 'road');

    key('3'); // sign: box only, while the brush is on
    expect(canvas).toHaveAttribute('data-tool', 'box');
    expect(canvas).toHaveAttribute('data-class', 'sign');
  });

  it('resizes the brush and keeps it within bounds', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    expect(canvas).toHaveAttribute('data-radius', '12');
    key(']');
    expect(canvas).toHaveAttribute('data-radius', '14');
    key('[');
    key('[');
    expect(canvas).toHaveAttribute('data-radius', '10');
    for (let i = 0; i < 80; i++) key('[');
    expect(canvas).toHaveAttribute('data-radius', '1');
  });

  it('cycles through the sensors the frame has', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['true', 'false']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['false', 'true']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['true', 'true']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['false', 'false']);
  });

  it('has no sensor to cycle on a camera-only frame', async () => {
    queueState.current = makeItem('t1');
    open();
    await screen.findByText('Street scenes');

    key('v');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-lidar', 'false');
    expect(screen.queryByRole('button', { name: 'show lidar' })).not.toBeInTheDocument();
  });

  it('deletes the selected box, and undoes and redoes', async () => {
    open();
    await screen.findByText('Street scenes');
    act(() => doc.addBox(box('a')));

    key('Delete');
    expect(doc.boxes).toEqual([]);

    key('z', { ctrlKey: true });
    expect(doc.boxes).toHaveLength(1);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(doc.boxes).toEqual([]);
    key('z', { metaKey: true });
    key('y', { ctrlKey: true });
    expect(doc.boxes).toEqual([]);
  });

  it('accepts or dismisses suggestions from the keyboard', async () => {
    open();
    await screen.findByText('Street scenes');

    key('a');
    expect(acceptAll).toHaveBeenCalled();
    key('x');
    expect(dismiss).toHaveBeenCalled();
  });

  it('fits the frame, opens the shortcut list, and ignores typing in a field', async () => {
    open();
    await screen.findByText('Street scenes');

    key('f');
    key('?');
    expect(await screen.findByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Pick a class')).toBeInTheDocument();

    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(queueState.finish).not.toHaveBeenCalled();
    field.remove();
  });

  it('ignores letters that are not shortcuts', async () => {
    open();
    await screen.findByText('Street scenes');

    key('q');
    key('Escape');

    expect(queueState.finish).not.toHaveBeenCalled();
  });
});
