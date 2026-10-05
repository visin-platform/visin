import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsEditor, { type ResultDraft } from './ResultsEditor';

const Harness = ({ initial = [], onChange }: { initial?: ResultDraft[]; onChange?: (next: ResultDraft[]) => void }) => {
  const [value, setValue] = useState(initial);
  return <ResultsEditor value={value} onChange={(next) => { setValue(next); onChange?.(next); }} />;
};

describe('ResultsEditor', () => {
  it('adds a result from a pasted address, once, and clears the box', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = screen.getByLabelText('Address of a Visin page');

    await userEvent.type(box, 'https://visin.example.test/projects/night-seg{enter}');
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'project', ref: 'night-seg', note: '' }]);
    expect(box).toHaveValue('');
    expect(screen.getByText('night-seg')).toBeInTheDocument();

    await userEvent.type(box, '/projects/night-seg');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('night-seg')).toHaveLength(1);
  });

  it('says so when the address is not a project, run or leaderboard, and forgets it once typing resumes', async () => {
    render(<Harness />);
    const box = screen.getByLabelText('Address of a Visin page');

    await userEvent.type(box, 'https://example.test/other');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/not the address of a Visin project, run or leaderboard/)).toBeInTheDocument();

    await userEvent.type(box, 'x');
    expect(screen.queryByText(/not the address of a Visin/)).not.toBeInTheDocument();
  });

  it('keeps where a result is used, and removes one', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[{ kind: 'training', ref: 't1', note: '', name: 'window16', available: false }]} onChange={onChange} />);

    expect(screen.getByText('Not public')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Where used'), 'T');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ ref: 't1', note: 'T' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove window16' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
