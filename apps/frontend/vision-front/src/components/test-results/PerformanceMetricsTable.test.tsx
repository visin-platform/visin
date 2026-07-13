import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PerformanceMetricsTable from './PerformanceMetricsTable';
import type { ComparisonData } from './performanceMetricsUtils';

const classMetric = (v: number) => ({ iou: { mean: v }, precision: { mean: v }, recall: { mean: v }, f1_score: { mean: v }, ap: { mean: v } });

const makeComparison = (id: string, name: string, iouValue: number): ComparisonData =>
  ({
    training: { _id: id, name },
    testResultsCount: 1,
    aggregatedResults: {
      day_fair: {
        human: classMetric(iouValue),
        sign: classMetric(iouValue - 0.1),
        vehicle: classMetric(iouValue + 0.1),
        overall: { fw_iou: { mean: iouValue } },
      },
    },
  } as unknown as ComparisonData);

const renderTable = (comparisonData: ComparisonData[]) =>
  render(
    <MemoryRouter>
      <PerformanceMetricsTable comparisonData={comparisonData} />
    </MemoryRouter>
  );

describe('PerformanceMetricsTable', () => {
  it('renders nothing for empty comparison data', () => {
    const { container } = renderTable([]);
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it('renders all five weather condition sections with linked training names', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    ['DAY FAIR', 'NIGHT FAIR', 'DAY RAIN', 'NIGHT RAIN', 'SNOW'].forEach((title) => {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole('link', { name: 'Run 1' })[0]).toHaveAttribute('href', '/trainings/t1');
  });

  it('bolds the best value and shows N/A for missing metrics', () => {
    renderTable([makeComparison('t1', 'Best', 0.9), makeComparison('t2', 'Worst', 0.1)]);

    expect(screen.getAllByText('0.9000').length).toBeGreaterThan(0);
    // night_fair etc. have no data for these trainings -> N/A
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('toggles column sort direction on repeated header clicks', () => {
    renderTable([makeComparison('t1', 'B Run', 0.5), makeComparison('t2', 'A Run', 0.8)]);

    const namesInOrder = () => screen.getAllByText(/^[AB] Run$/).map((el) => el.textContent);

    // Default sort is training/asc, so "A Run" leads.
    expect(namesInOrder()[0]).toBe('A Run');

    const dayFairSections = screen.getAllByText('DAY FAIR');
    fireEvent.click(dayFairSections[dayFairSections.length - 1]);

    expect(namesInOrder()[0]).toBe('B Run');
  });

  it('opens the LaTeX modal with generated code for a condition', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    const latexButtons = screen.getAllByRole('button', { name: /latex/i });
    fireEvent.click(latexButtons[0]);

    expect(screen.getByText(/Performance Metrics LaTeX Code - DAY FAIR/)).toBeInTheDocument();
  });
});
