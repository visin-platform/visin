import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestResultsList from './TestResultsList';
import type { TestResult } from '../../types';

const makeTestResult = (id: string, epoch: number): TestResult =>
  ({
    _id: id,
    test_uuid: `uuid-${id}`,
    epoch,
    test_results: {
      day_fair: { vehicle: { iou: 0.5, precision: 0.5, recall: 0.5, ap: 0.5 } },
    },
  } as unknown as TestResult);

const baseProps = {
  allTestResults: [] as TestResult[],
  testResultsLoading: false,
  availableTestEpochs: [] as number[],
  uploading: false,
  onLatexExport: vi.fn(),
  onDeleteTestResult: vi.fn(),
  isAuthenticated: true,
};

describe('TestResultsList', () => {
  it('shows a spinner while loading', () => {
    render(<TestResultsList {...baseProps} testResultsLoading />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state when there are no results', () => {
    render(<TestResultsList {...baseProps} />);

    expect(screen.getByText('No test results found')).toBeInTheDocument();
  });

  it('groups results by epoch, sorted ascending', () => {
    const results = [makeTestResult('a', 2), makeTestResult('b', 1)];
    render(
      <TestResultsList {...baseProps} allTestResults={results} availableTestEpochs={[2, 1]} />
    );

    const headings = screen.getAllByText(/Epoch \d/).map((el) => el.textContent);
    expect(headings).toEqual(['Epoch 1', 'Epoch 2']);
  });

  it('opens the delete confirmation dialog and confirms deletion', () => {
    const onDeleteTestResult = vi.fn();
    const results = [makeTestResult('a', 1)];
    render(
      <TestResultsList
        {...baseProps}
        allTestResults={results}
        availableTestEpochs={[1]}
        onDeleteTestResult={onDeleteTestResult}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    expect(screen.getByText(/Are you sure you want to delete this test result/)).toBeInTheDocument();
    expect(screen.getByText(/uuid-a/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteTestResult).toHaveBeenCalledWith('a');
  });

  it('closes the dialog on cancel without deleting', () => {
    const onDeleteTestResult = vi.fn();
    const results = [makeTestResult('a', 1)];
    render(
      <TestResultsList
        {...baseProps}
        allTestResults={results}
        availableTestEpochs={[1]}
        onDeleteTestResult={onDeleteTestResult}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteTestResult).not.toHaveBeenCalled();
  });
});
