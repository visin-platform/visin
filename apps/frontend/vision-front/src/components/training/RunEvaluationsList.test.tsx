import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RunEvaluationsList from './RunEvaluationsList';
import type { RunEvaluation } from '../../types';

const makeEvaluation = (id: string, epoch: number): RunEvaluation =>
  ({
    _id: id,
    test_uuid: `uuid-${id}`,
    epoch,
    test_results: {
      day_fair: { vehicle: { iou: 0.5, precision: 0.5, recall: 0.5, ap: 0.5 } },
    },
  } as unknown as RunEvaluation);

const baseProps = {
  allEvaluations: [] as RunEvaluation[],
  evaluationsLoading: false,
  availableEpochs: [] as number[],
  uploading: false,
  onLatexExport: vi.fn(),
  onDeleteEvaluation: vi.fn(),
  isAuthenticated: true,
};

describe('RunEvaluationsList', () => {
  it('shows a spinner while loading', () => {
    render(<RunEvaluationsList {...baseProps} evaluationsLoading />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state when there are no results', () => {
    render(<RunEvaluationsList {...baseProps} />);

    expect(screen.getByText('No evaluations yet')).toBeInTheDocument();
  });

  it('says why a finished or running run has no results', () => {
    const { rerender } = render(<RunEvaluationsList {...baseProps} run={{ status: 'completed' }} />);
    expect(screen.getByText('No evaluations')).toBeInTheDocument();
    expect(screen.getByText(/finished without reporting any\. The test stage may have been skipped/)).toBeInTheDocument();

    rerender(<RunEvaluationsList {...baseProps} run={{ status: 'running' }} />);
    expect(screen.getByText('No evaluations yet')).toBeInTheDocument();
    expect(screen.getByText(/still training\. The test stage usually comes after it/)).toBeInTheDocument();
  });

  it('groups results by epoch, sorted ascending', () => {
    const results = [makeEvaluation('a', 2), makeEvaluation('b', 1)];
    render(
      <RunEvaluationsList {...baseProps} allEvaluations={results} availableEpochs={[2, 1]} />
    );

    const headings = screen.getAllByText(/Epoch \d/).map((el) => el.textContent);
    expect(headings).toEqual(['Epoch 1', 'Epoch 2']);
  });

  it('opens the delete confirmation dialog and confirms deletion', () => {
    const onDeleteEvaluation = vi.fn();
    const results = [makeEvaluation('a', 1)];
    render(
      <RunEvaluationsList
        {...baseProps}
        allEvaluations={results}
        availableEpochs={[1]}
        onDeleteEvaluation={onDeleteEvaluation}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    expect(screen.getByText(/Are you sure you want to delete this evaluation/)).toBeInTheDocument();
    expect(screen.getByText(/uuid-a/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteEvaluation).toHaveBeenCalledWith('a');
  });

  it('closes the dialog on cancel without deleting', () => {
    const onDeleteEvaluation = vi.fn();
    const results = [makeEvaluation('a', 1)];
    render(
      <RunEvaluationsList
        {...baseProps}
        allEvaluations={results}
        availableEpochs={[1]}
        onDeleteEvaluation={onDeleteEvaluation}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteEvaluation).not.toHaveBeenCalled();
  });
});
