import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestResultTable from './TestResultTable';
import type { TestResult } from '../../types';

const metric = (v: number) => ({ iou: v, precision: v, recall: v, ap: v });

const makeTestResult = (overrides: Record<string, unknown> = {}): TestResult =>
  ({
    _id: 'tr1',
    test_uuid: 'uuid-1',
    test_results: {
      day_fair: {
        vehicle: metric(0.8),
        sign: metric(0.6),
        human: metric(0.4),
        overall: {
          mIoU_foreground: 0.5,
          mean_accuracy: 0.6,
          fw_iou: 0.7,
          pixel_accuracy: 0.9,
          confusion_matrix: [[10, 1], [2, 20]],
          confusion_matrix_labels: ['background', 'vehicle'],
        },
      },
      overall: { mIoU_foreground: 0.55, mean_accuracy: 0.65, fw_iou: 0.75, pixel_accuracy: 0.95 },
    },
    ...overrides,
  } as unknown as TestResult);

const baseProps = {
  onLatexExport: vi.fn(),
  onDeleteTestResult: vi.fn(),
  isAuthenticated: true,
};

describe('TestResultTable', () => {
  it('renders per-condition metrics with 4-decimal formatting', () => {
    render(<TestResultTable {...baseProps} testResult={makeTestResult()} />);

    // no project taxonomy in scope, so the condition key is humanized
    expect(screen.getByText('Day Fair')).toBeInTheDocument();
    expect(screen.getAllByText('0.8000').length).toBeGreaterThan(0);
  });

  it('renders the "All" overall row when test_results.overall is present', () => {
    render(<TestResultTable {...baseProps} testResult={makeTestResult()} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('0.5500')).toBeInTheDocument();
  });

  it('omits the "All" row when there is no overall summary', () => {
    render(
      <TestResultTable
        {...baseProps}
        testResult={makeTestResult({ test_results: { day_fair: makeTestResult().test_results.day_fair } })}
      />
    );

    expect(screen.queryByText('All')).not.toBeInTheDocument();
  });

  it('renders overall and per-condition confusion matrices', () => {
    render(<TestResultTable {...baseProps} testResult={makeTestResult()} />);

    expect(screen.getByText('Overall Confusion Matrix (All Conditions)')).toBeInTheDocument();
    expect(screen.getByText('Day Fair Confusion Matrix')).toBeInTheDocument();
  });

  it('calls onLatexExport', () => {
    const onLatexExport = vi.fn();
    const testResult = makeTestResult();
    render(<TestResultTable {...baseProps} testResult={testResult} onLatexExport={onLatexExport} />);

    fireEvent.click(screen.getByRole('button', { name: /export latex/i }));
    expect(onLatexExport).toHaveBeenCalledWith(testResult);
  });

  it('calls onDeleteTestResult when authenticated', () => {
    const onDeleteTestResult = vi.fn();
    render(<TestResultTable {...baseProps} testResult={makeTestResult()} onDeleteTestResult={onDeleteTestResult} />);

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    expect(onDeleteTestResult).toHaveBeenCalledWith('tr1');
  });

  it('hides the delete button when not authenticated or no handler given', () => {
    const { rerender } = render(<TestResultTable {...baseProps} testResult={makeTestResult()} isAuthenticated={false} />);
    expect(screen.queryByRole('button', { name: /delete result/i })).not.toBeInTheDocument();

    rerender(<TestResultTable {...baseProps} testResult={makeTestResult()} onDeleteTestResult={undefined} />);
    expect(screen.queryByRole('button', { name: /delete result/i })).not.toBeInTheDocument();
  });

  it('picks up an extra class from the payload with no configuration', () => {
    const withExtra = makeTestResult({
      test_results: {
        day_fair: {
          ...(makeTestResult().test_results.day_fair as Record<string, unknown>),
          'cyclist + pedestrian': metric(0.5),
        },
      },
    });
    render(<TestResultTable {...baseProps} testResult={withExtra} />);

    // one header cell per metric group
    expect(screen.getAllByText('Cyclist + Pedestrian').length).toBe(4);
  });

  it('renders an unfamiliar vocabulary from the data alone', () => {
    const factory = makeTestResult({
      test_results: { line_a: { scratch: metric(0.4), overall: { mean_dice: 0.6 } } },
    });
    render(<TestResultTable {...baseProps} testResult={factory} />);

    expect(screen.getByText('Line A')).toBeInTheDocument();
    expect(screen.getAllByText('Scratch').length).toBe(4);
    expect(screen.getByText('Mean Dice')).toBeInTheDocument();
    expect(screen.queryByText('Day Fair')).not.toBeInTheDocument();
  });

  it('labels confusion-matrix axes by position when the payload names none', () => {
    const unlabelled = makeTestResult({
      test_results: {
        day_fair: { vehicle: metric(0.8), overall: { confusion_matrix: [[1, 2], [3, 4]] } },
      },
    });
    render(<TestResultTable {...baseProps} testResult={unlabelled} />);

    expect(screen.getAllByText('Class 0').length).toBeGreaterThan(0);
  });
});
