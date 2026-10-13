import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({ importLabels: vi.fn() }));

import { importLabels } from '../services/jobService';
import ImportDialog from './ImportDialog';
import { renderWithProviders } from '../test/renderWithProviders';
import { carClass, roadClass } from '../test/fixtures';
import type { ImportReport } from '../types';

const send = importLabels as ReturnType<typeof vi.fn>;

const report = (overrides: Partial<ImportReport> = {}): ImportReport => ({
  format: 'yolo',
  formatName: 'YOLO',
  dryRun: true,
  as: 'suggestions',
  frames: { inFile: 12, matched: 10, unmatched: 2, unmatchedSample: ['x1', 'x2'] },
  classes: [
    { name: 'car', boxes: 20, maskFrames: 0, target: 'car', matched: true },
    { name: 'pedestrian', boxes: 5, maskFrames: 0, target: null, matched: false }
  ],
  boxes: 20,
  maskFrames: 0,
  createdClasses: [],
  warnings: [],
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue(report());
});

const choose = (name = 'labels.zip') => {
  const input = screen.getByLabelText('labels archive') as HTMLInputElement;
  const file = new File(['zip'], name, { type: 'application/zip' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

const open = (onClose = vi.fn()) => {
  renderWithProviders(<ImportDialog open jobId="j1" classes={[carClass, roadClass]} onClose={onClose} />);
  return onClose;
};

describe('ImportDialog', () => {
  it('reads the archive first and describes what is in it', async () => {
    open();

    const file = choose();

    expect(await screen.findByText(/Looks like/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('j1', file, { as: 'suggestions', dryRun: true });
    expect(screen.getByText(/10 of/)).toBeInTheDocument();
    expect(screen.getByText(/x1, x2/)).toBeInTheDocument();
    expect(screen.getByText('labels.zip')).toBeInTheDocument();
  });

  it('offers a choice for each class, starting from the match', async () => {
    open();
    choose();
    await screen.findByText(/Looks like/);

    expect(screen.getByLabelText('class for car')).toHaveTextContent('Car');
    expect(screen.getByLabelText('class for pedestrian')).toHaveTextContent('Leave out');
  });

  it('imports with the choices made, then reports what it did', async () => {
    open();
    const file = choose();
    await screen.findByText(/Looks like/);

    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByRole('option', { name: 'Add as a new class' }));
    send.mockResolvedValueOnce(
      report({ dryRun: false, boxes: 25, maskFrames: 3, createdClasses: ['pedestrian'], frames: { inFile: 12, matched: 10, unmatched: 2, unmatchedSample: [] } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByText(/Imported 25 boxes and 3 masks onto 10 frames/)).toBeInTheDocument());
    expect(send).toHaveBeenLastCalledWith('j1', file, {
      as: 'suggestions',
      dryRun: false,
      classMap: { car: 'car', pedestrian: '+' }
    });
    expect(screen.getByText(/Added 1 new class/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('sends a left-out class as null, and imports as finished labels when asked', async () => {
    open();
    const file = choose();
    await screen.findByText(/Looks like/);

    fireEvent.click(screen.getByLabelText(/As finished labels/));
    send.mockResolvedValueOnce(report({ dryRun: false, as: 'done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByText(/as finished labels/)).toBeInTheDocument());
    expect(send).toHaveBeenLastCalledWith('j1', file, {
      as: 'done',
      dryRun: false,
      classMap: { car: 'car', pedestrian: null }
    });
  });

  it('will not import an archive none of whose frames are in the job', async () => {
    send.mockResolvedValue(report({ frames: { inFile: 4, matched: 0, unmatched: 4, unmatchedSample: ['a'] } }));
    open();
    choose();

    await screen.findByText(/Looks like/);

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('shows warnings from the file, shortened', async () => {
    send.mockResolvedValue(report({ warnings: ['a', 'b', 'c', 'd', 'e'] }));
    open();
    choose();

    expect(await screen.findByText(/a · b · c · and 2 more/)).toBeInTheDocument();
  });

  it('shows a file it cannot read', async () => {
    send.mockRejectedValue(new Error('Could not recognise these labels'));
    open();
    choose();

    expect(await screen.findByText('Could not recognise these labels')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('shows a failed import and lets it be tried again', async () => {
    open();
    choose();
    await screen.findByText(/Looks like/);
    send.mockRejectedValueOnce(new Error('Job is archived'));

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText('Job is archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).not.toBeDisabled();
  });

  it('starts over when another file is chosen, and closes clean', async () => {
    const onClose = open();
    choose('a.zip');
    await screen.findByText(/Looks like/);

    choose('b.zip');
    await waitFor(() => expect(screen.getByText('b.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('clearing the file choice leaves nothing to import', async () => {
    open();
    const input = screen.getByLabelText('labels archive') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [] } });

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
