import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PerformanceMetricsTable from './PerformanceMetricsTable';
import type { ComparisonData } from './performanceMetricsUtils';
import { TaxonomyProvider } from '../../taxonomy/TaxonomyProvider';
import type { ProjectTaxonomy } from '../../types/taxonomy';

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

/** A vocabulary the platform has never seen, to prove nothing is hard-coded. */
const factoryComparison = (id: string, name: string, value: number): ComparisonData =>
  ({
    training: { _id: id, name },
    testResultsCount: 1,
    aggregatedResults: {
      line_a: {
        scratch: { iou: { mean: value }, loss: { mean: value } },
        overall: { mean_dice: { mean: value } },
      },
    },
  } as unknown as ComparisonData);

/**
 * MUI puts sx styles in an emitted class and jsdom reports the numeric weight,
 * so read the resolved value back and normalise it.
 */
const weightOf = (el: HTMLElement) =>
  getComputedStyle(el).fontWeight === '700' ? 'bold' : 'normal';

const renderTable = (comparisonData: ComparisonData[], taxonomy?: ProjectTaxonomy) =>
  render(
    <MemoryRouter>
      <TaxonomyProvider taxonomy={taxonomy}>
        <PerformanceMetricsTable comparisonData={comparisonData} />
      </TaxonomyProvider>
    </MemoryRouter>
  );

describe('PerformanceMetricsTable', () => {
  it('renders nothing for empty comparison data', () => {
    const { container } = renderTable([]);
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it('renders only the conditions the data contains when nothing is configured', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)]);

    expect(screen.getAllByText('DAY FAIR').length).toBeGreaterThan(0);
    expect(screen.queryByText('SNOW')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Run 1' })[0]).toHaveAttribute('href', '/trainings/t1');
  });

  it('keeps a configured condition the current data lacks, and uses its label', () => {
    renderTable([makeComparison('t1', 'Run 1', 0.5)], {
      conditions: [
        { key: 'day_fair', label: 'Fair Day', order: 0 },
        { key: 'snow', label: 'Snowfall', order: 1 },
      ],
    });

    expect(screen.getAllByText('FAIR DAY').length).toBeGreaterThan(0);
    // configured but absent from the data — the column stays, filled with N/A
    expect(screen.getAllByText('SNOWFALL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('renders an entirely unfamiliar vocabulary from the data alone', () => {
    renderTable([factoryComparison('t1', 'Run 1', 0.5)]);

    expect(screen.getAllByText('LINE A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Scratch').length).toBeGreaterThan(0);
    // `mean_dice` is the only overall metric present, so it becomes the summary
    expect(screen.getAllByText('Mean Dice').length).toBeGreaterThan(0);
  });

  it('bolds the best value across trainings', () => {
    renderTable([makeComparison('t1', 'Best', 0.9), makeComparison('t2', 'Worst', 0.1)]);

    expect(weightOf(screen.getAllByText('0.9000')[0])).toBe('bold');
    expect(weightOf(screen.getAllByText('0.1000')[0])).toBe('normal');
  });

  it('bolds the lowest value for a metric where lower is better', () => {
    renderTable([factoryComparison('t1', 'Low', 0.1), factoryComparison('t2', 'High', 0.9)], {
      metrics: [{ key: 'loss', direction: 'lower' }],
    });

    // Each value appears as iou, as loss, and in the overall column. Exactly one
    // of each pair is the winner: the highest iou (0.9) and the lowest loss (0.1).
    // Before direction was honoured, 0.9 won both and no 0.1000 was ever bold.
    const boldCount = (text: string) =>
      screen.getAllByText(text).filter(el => weightOf(el) === 'bold').length;
    expect(boldCount('0.1000')).toBe(1);
    expect(boldCount('0.9000')).toBe(1);
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
