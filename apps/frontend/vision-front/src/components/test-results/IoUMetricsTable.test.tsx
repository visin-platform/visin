import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IoUMetricsTable from './IoUMetricsTable';
import { TaxonomyProvider } from '../../taxonomy/TaxonomyProvider';

const iouMetric = (v: number) => ({ iou: { mean: v } });

const makeComparison = (id: string, name: string, iouValue: number) => ({
  training: { _id: id, name },
  testResultsCount: 1,
  aggregatedResults: {
    day_fair: {
      human: iouMetric(iouValue),
      sign: iouMetric(iouValue - 0.1),
      vehicle: iouMetric(iouValue + 0.1),
    },
  },
});

const renderTable = (comparisonData: ReturnType<typeof makeComparison>[], props: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <IoUMetricsTable comparisonData={comparisonData} {...props} />
    </MemoryRouter>
  );

describe('IoUMetricsTable', () => {
  it('renders nothing for empty comparison data', () => {
    const { container } = renderTable([]);
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it('renders linked training names and formatted IoU values', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    expect(screen.getAllByRole('link', { name: 'Run 1' })[0]).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getAllByText('0.5000').length).toBeGreaterThan(0);
  });

  it('restricts to the given classFilter and reflects it in the title', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)], { classFilter: ['human'] });

    expect(screen.getByText(/IoU Metrics Comparison - human/)).toBeInTheDocument();
    expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
  });

  it('opens the LaTeX modal for a condition', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    fireEvent.click(screen.getAllByRole('button', { name: /latex/i })[0]);

    expect(screen.getByText(/IoU Metrics LaTeX Code/)).toBeInTheDocument();
  });

  it('renders a vocabulary the platform has never seen, from the data alone', () => {
    const factory = {
      training: { _id: 't1', name: 'Run 1' },
      testResultsCount: 1,
      aggregatedResults: { line_a: { scratch: { iou: { mean: 0.5 } }, dent: { iou: { mean: 0.7 } } } }
    } as unknown as ReturnType<typeof makeComparison>;

    renderTable([factory]);

    expect(screen.getAllByText('LINE A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Scratch IoU').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dent IoU').length).toBeGreaterThan(0);
    expect(screen.queryByText('DAY FAIR')).not.toBeInTheDocument();
  });

  it('uses the project labels and ordering when a taxonomy is configured', () => {
    render(
      <MemoryRouter>
        <TaxonomyProvider
          taxonomy={{
            conditionLabel: 'Shift',
            conditions: [{ key: 'day_fair', label: 'Morning Shift' }],
            classes: [{ key: 'human', label: 'Operator' }]
          }}
        >
          <IoUMetricsTable comparisonData={[makeComparison('t1', 'Run 1', 0.5)]} />
        </TaxonomyProvider>
      </MemoryRouter>
    );

    expect(screen.getAllByText('MORNING SHIFT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operator IoU').length).toBeGreaterThan(0);
    expect(screen.getByText(/by shift and classes/)).toBeInTheDocument();
  });

  it('sorts by training name, toggling direction on repeated clicks', () => {
    renderTable([makeComparison('t1', 'B Run', 0.5), makeComparison('t2', 'A Run', 0.8)]);
    const namesInOrder = () => screen.getAllByText(/^[AB] Run$/).map((el) => el.textContent);

    expect(namesInOrder()[0]).toBe('A Run');

    const testResultHeaders = screen.getAllByText('Test Result');
    fireEvent.click(testResultHeaders[0]);

    expect(namesInOrder()[0]).toBe('B Run');
  });
});
