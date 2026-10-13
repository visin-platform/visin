import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import ModelClassMappingDialog from './ModelClassMappingDialog';
import { setModelClassMapping } from '../services/jobService';
import type { JobClass } from '../types';

vi.mock('../services/jobService', () => ({ setModelClassMapping: vi.fn() }));
const save = vi.mocked(setModelClassMapping);
const classes: JobClass[] = [
  { key: 'human', name: 'Human', color: '#2a78d6', tools: ['box'], maskIndex: 1, modelClass: 'person' },
  { key: 'vehicle', name: 'Vehicle', color: '#eb6834', tools: ['box', 'mask'], maskIndex: 2 },
  { key: 'road', name: 'Road', color: '#1baf7a', tools: ['mask'], maskIndex: 3 }
];
beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue({} as never); });
const open = (entries = classes) => {
  const close = vi.fn();
  renderWithProviders(<ModelClassMappingDialog jobId="j1" classes={entries} modelClasses={['person', 'car']} onClose={close} />);
  return close;
};

describe('ModelClassMappingDialog', () => {
  it('loads explicit names, saves new names and clears a name with a blank field', async () => {
    const close = open();
    expect(screen.getByLabelText('Model class for Human')).toHaveValue('person');
    expect(screen.queryByLabelText('Model class for Road')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Model class for Human'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Model class for Vehicle'), { target: { value: ' car ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mappings' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('j1', { human: null, vehicle: 'car' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open and shows a refused save', async () => {
    save.mockRejectedValue(new Error('Only managers can change mappings'));
    const close = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save mappings' }));
    expect(await screen.findByText('Only managers can change mappings')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
  });

  it('cannot save when a job has no box classes', () => {
    open([classes[2]]);
    expect(screen.getByText('This job has no box classes to match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save mappings' })).toBeDisabled();
  });

  it('closes with Escape before saving', () => {
    const close = open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending save open', async () => {
    save.mockReturnValue(new Promise(() => undefined));
    const close = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save mappings' }));
    await screen.findByRole('button', { name: 'Saving…' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
