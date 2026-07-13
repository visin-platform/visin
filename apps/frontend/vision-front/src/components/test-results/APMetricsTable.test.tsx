import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import APMetricsTable from './APMetricsTable';

const apMetric = (v: number) => ({ ap: { mean: v } });

const makeComparison = (id: string, name: string, apValue: number) => ({
  training: { _id: id, name },
  testResultsCount: 1,
  aggregatedResults: {
    day_fair: {
      human: apMetric(apValue),
      sign: apMetric(apValue - 0.1),
      vehicle: apMetric(apValue + 0.1),
    },
  },
});

const renderTable = (comparisonData: ReturnType<typeof makeComparison>[]) =>
  render(
    <MemoryRouter>
      <APMetricsTable comparisonData={comparisonData} />
    </MemoryRouter>
  );

describe('APMetricsTable', () => {
  it('renders nothing for empty comparison data', () => {
    const { container } = renderTable([]);
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it('renders linked training names and formatted AP values', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    expect(screen.getAllByRole('link', { name: 'Run 1' })[0]).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getAllByText('0.5000').length).toBeGreaterThan(0);
  });

  it('opens the LaTeX modal for a condition', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    fireEvent.click(screen.getAllByRole('button', { name: /latex/i })[0]);

    expect(screen.getByText(/AP Metrics LaTeX Code/)).toBeInTheDocument();
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
