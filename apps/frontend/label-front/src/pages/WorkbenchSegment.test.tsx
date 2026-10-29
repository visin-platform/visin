import { describe, it, expect, vi } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';

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

import { ImageNeededError } from '../localModel/client';
import { encodeMaskRle } from '../editor/maskCodec';
import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { authState, queueState, modelState, doc, flush, key, installWorkbenchHarness } from '../test/workbenchHarness';

const open = (route = '/jobs/j1/work') => renderWithProviders(<WorkbenchPage />, { route, path: '/jobs/:id/work' });

installWorkbenchHarness();

describe('the segment tool', () => {
  const connected = () =>
    Object.assign(modelState, {
      status: 'connected',
      info: { device: 'RTX 4070', classes: ['car'], supports: { detect: true, segment: true } },
      canDetect: false,
      canSegment: true,
    });
  const answer = (cells: number) => {
    const data = new Uint8Array(200 * 100);
    data.fill(1, 0, cells);
    return { rle: encodeMaskRle(200, 100, data), width: 200, height: 100, bbox: [0, 0, 1, 1], score: 0.9 };
  };

  it.each(['p', 'b', '3'])('keeps a ready mask in its original class when leaving SAM with %s', async (shortcut) => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));
    key(shortcut);
    expect(doc.mask.filter((value) => value === 2)).toHaveLength(30);
    expect(doc.canUndo).toBe(true);
  });

  it('does not restore a cleared prompt when its pending answer arrives', async () => {
    connected();
    let resolve: (value: ReturnType<typeof answer>) => void = () => undefined;
    modelState.segment.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    open();
    await screen.findByText('Street scenes');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(modelState.segment).toHaveBeenCalled());
    fireEvent.click(screen.getByText('fake-sam-clear'));
    await act(async () => { resolve(answer(30)); });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
  });

  it('keeps the preview before Done saves the frame', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));
    flush.mockImplementationOnce(async () => {
      expect(doc.hasMask).toBe(true);
      return true;
    });
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
  });

  it('is chosen with S, and only when a model can segment', async () => {
    open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });

  it('asks the model for the mask under each click, sending the frame the first time', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(40));
    open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');
    expect(screen.getByText(/Click the object/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('fake-sam-click'));

    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '40'));
    const first = modelState.segment.mock.calls[0][0];
    expect(first).toMatchObject({ imageId: 't1', points: [{ x: 3, y: 4, label: 1 }] });
    expect(first.image).toBeInstanceOf(Blob);
    expect(screen.getByText(/Enter keeps this mask/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(modelState.segment).toHaveBeenCalledTimes(2));
    // The server has the frame by now; it is not sent again.
    expect(modelState.segment.mock.calls[1][0].image).toBeUndefined();
  });

  it('sends the frame again when the server says it has lost it', async () => {
    connected();
    modelState.segment.mockRejectedValueOnce(new ImageNeededError()).mockResolvedValue(answer(10));
    open();
    await screen.findByText('Street scenes');
    key('s');

    fireEvent.click(screen.getByText('fake-sam-click'));

    await waitFor(() => expect(modelState.segment).toHaveBeenCalledTimes(2));
    expect(modelState.segment.mock.calls[1][0].image).toBeInstanceOf(Blob);
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '10'));
  });

  it('Enter keeps the mask as the active class, and the next Enter finishes the frame', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2'); // road: a mask class
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    key('Enter');

    expect(doc.mask.filter((value) => value === 2)).toHaveLength(30);
    expect(queueState.finish).not.toHaveBeenCalled();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
    expect(doc.canUndo).toBe(true);

    key('Enter');
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
  });

  it('Shift+Enter paints over what is already drawn', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(5));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    act(() => {
      doc.beginStroke(1);
      doc.strokeTo(2, 0, 1.5);
      doc.endStroke();
    });
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '5'));

    key('Enter', { shiftKey: true });

    expect(doc.mask.slice(0, 5)).toEqual(Uint8Array.from([2, 2, 2, 2, 2]));
  });

  it('Escape drops the mask without keeping it', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    key('Escape');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
    expect(doc.hasMask).toBe(false);
  });

  it('clearing the prompts clears the mask', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    fireEvent.click(screen.getByText('fake-sam-clear'));

    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1'));
    expect(modelState.segment).toHaveBeenCalledTimes(1);
  });

  it('shows a model failure and keeps working', async () => {
    connected();
    modelState.segment.mockRejectedValue(new Error('RuntimeError: CUDA out of memory'));
    open();
    await screen.findByText('Street scenes');
    key('s');

    fireEvent.click(screen.getByText('fake-sam-click'));

    expect(await screen.findByText(/CUDA out of memory/)).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');
  });

  it('drops back to the box tool when the model goes away, and leaves the tool when another is chosen', async () => {
    connected();
    const view = open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');

    key('p');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'brush');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-points', '-1');

    key('s');
    view.unmount();
    Object.assign(modelState, { status: 'unreachable', canSegment: false });
    open();
    await screen.findByText('Street scenes');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });

  it('offers no segmenting to a viewer', async () => {
    connected();
    authState.isAuthenticated = false;
    open();
    await screen.findByText('Street scenes');

    key('s');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
    expect(screen.queryByRole('button', { name: 'segment tool' })).not.toBeInTheDocument();
  });
});
