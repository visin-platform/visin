import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PerClassMetricsTable from './PerClassMetricsTable';

const classMetric = (v: number) => ({
  iou: { mean: v, std: 0 },
  precision: { mean: v, std: 0 },
  recall: { mean: v, std: 0 },
  f1_score: { mean: v, std: 0 },
  ap: { mean: v, std: 0 },
});

const makeComparison = (id: string, name: string, v: number) => ({
  training: { _id: id, name },
  testResultsCount: 1,
  aggregatedResults: {
    day_fair: {
      human: classMetric(v),
      sign: classMetric(v - 0.1),
      vehicle: classMetric(v + 0.1),
    },
  },
});

interface ComparisonDataLike {
  training: { _id: string; name: string };
  testResultsCount: number;
  aggregatedResults: Record<string, unknown>;
}

const renderTable = (comparisonData: ComparisonDataLike[], onGenerateLatex = vi.fn()) =>
  render(
    <MemoryRouter>
      <PerClassMetricsTable comparisonData={comparisonData} onGenerateLatex={onGenerateLatex} />
    </MemoryRouter>
  );

describe('PerClassMetricsTable', () => {
  it('renders nothing for empty comparison data', () => {
    const { container } = renderTable([]);
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it('renders linked training names and formatted metric values', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    expect(screen.getAllByRole('link', { name: 'Run 1' })[0]).toHaveAttribute('href', '/trainings/t1');
    expect(
      screen.getAllByText((_, el) => el?.textContent === '0.50 ± 0.00').length
    ).toBeGreaterThan(0);
  });

  it('shows N/A for missing metric values', () => {
    const sparse = { training: { _id: 't1', name: 'Sparse' }, testResultsCount: 1, aggregatedResults: {} };
    renderTable([sparse]);

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('calls the onGenerateLatex prop (component delegates LaTeX generation to its caller)', () => {
    const onGenerateLatex = vi.fn();
    renderTable([makeComparison('t1', 'Run 1', 0.5)], onGenerateLatex);

    fireEvent.click(screen.getAllByRole('button', { name: /latex/i })[0]);

    expect(onGenerateLatex).toHaveBeenCalledTimes(1);
  });
});
