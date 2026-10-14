import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RunEvaluationCard from './RunEvaluationCard';
import type { RunEvaluation } from '../../types';

const metric = (v: number) => ({ iou: v, precision: v, recall: v, ap: v });

const makeEvaluation = (overrides: Record<string, unknown> = {}): RunEvaluation =>
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
  } as unknown as RunEvaluation);

const baseProps = {
  onLatexExport: vi.fn(),
  onDeleteEvaluation: vi.fn(),
  isAuthenticated: true,
};

describe('RunEvaluationCard', () => {
  it('renders per-condition metrics with 4-decimal formatting', () => {
    render(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} />);

    // no project taxonomy in scope, so the condition key is humanized
    expect(screen.getByText('Day Fair')).toBeInTheDocument();
    expect(screen.getAllByText('0.8000').length).toBeGreaterThan(0);
  });

  it('renders the "All" overall row when test_results.overall is present', () => {
    render(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('0.5500')).toBeInTheDocument();
  });

  it('omits the "All" row when there is no overall summary', () => {
    render(
      <RunEvaluationCard
        {...baseProps}
        evaluation={makeEvaluation({ test_results: { day_fair: makeEvaluation().test_results.day_fair } })}
      />
    );

    expect(screen.queryByText('All')).not.toBeInTheDocument();
  });

  it('renders overall and per-condition confusion matrices', () => {
    render(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} />);

    expect(screen.getByText('Overall Confusion Matrix (All Conditions)')).toBeInTheDocument();
    expect(screen.getByText('Day Fair Confusion Matrix')).toBeInTheDocument();
  });

  it('calls onLatexExport', () => {
    const onLatexExport = vi.fn();
    const evaluation = makeEvaluation();
    render(<RunEvaluationCard {...baseProps} evaluation={evaluation} onLatexExport={onLatexExport} />);

    fireEvent.click(screen.getByRole('button', { name: /export latex/i }));
    expect(onLatexExport).toHaveBeenCalledWith(evaluation);
  });

  it('calls onDeleteEvaluation when authenticated', () => {
    const onDeleteEvaluation = vi.fn();
    render(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} onDeleteEvaluation={onDeleteEvaluation} />);

    fireEvent.click(screen.getByRole('button', { name: /delete result/i }));
    expect(onDeleteEvaluation).toHaveBeenCalledWith('tr1');
  });

  it('hides the delete button when not authenticated or no handler given', () => {
    const { rerender } = render(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} isAuthenticated={false} />);
    expect(screen.queryByRole('button', { name: /delete result/i })).not.toBeInTheDocument();

    rerender(<RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} onDeleteEvaluation={undefined} />);
    expect(screen.queryByRole('button', { name: /delete result/i })).not.toBeInTheDocument();
  });

  it('picks up an extra class from the payload with no configuration', () => {
    const withExtra = makeEvaluation({
      test_results: {
        day_fair: {
          ...(makeEvaluation().test_results.day_fair as Record<string, unknown>),
          'cyclist + pedestrian': metric(0.5),
        },
      },
    });
    render(<RunEvaluationCard {...baseProps} evaluation={withExtra} />);

    // one header cell per metric group
    expect(screen.getAllByText('Cyclist + Pedestrian').length).toBe(4);
  });

  it('renders an unfamiliar vocabulary from the data alone', () => {
    const factory = makeEvaluation({
      test_results: { line_a: { scratch: metric(0.4), overall: { mean_dice: 0.6 } } },
    });
    render(<RunEvaluationCard {...baseProps} evaluation={factory} />);

    expect(screen.getByText('Line A')).toBeInTheDocument();
    expect(screen.getAllByText('Scratch').length).toBe(4);
    expect(screen.getByText('Mean Dice')).toBeInTheDocument();
    expect(screen.queryByText('Day Fair')).not.toBeInTheDocument();
  });

  it('labels confusion-matrix axes by position when the payload names none', () => {
    const unlabelled = makeEvaluation({
      test_results: {
        day_fair: { vehicle: metric(0.8), overall: { confusion_matrix: [[1, 2], [3, 4]] } },
      },
    });
    render(<RunEvaluationCard {...baseProps} evaluation={unlabelled} />);

    expect(screen.getAllByText('Class 0').length).toBeGreaterThan(0);
  });

  describe('as an evaluation of the run', () => {
    const scored = {
      suite: { id: 's1', slug: 'night-drive', version: 2 },
      validation: { version: 1, state: 'eligible', reasons: [], warnings: [] },
      publishedAt: '2026-10-01T00:00:00.000Z',
      timestamp: '2026-09-30T10:00:00.000Z'
    };
    const renderCard = (overrides: Record<string, unknown> = {}, props = {}) =>
      render(
        <MemoryRouter>
          <RunEvaluationCard {...baseProps} evaluation={makeEvaluation(overrides)} {...props} />
        </MemoryRouter>
      );

    it('says which suite it was scored on, whether it ranks, and links to its ranking and evidence', () => {
      renderCard(scored);

      expect(screen.getByText('Scored on night-drive v2')).toBeInTheDocument();
      expect(screen.getByText('Ranked')).toBeInTheDocument();
      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ranking and evidence' })).toHaveAttribute('href', '/evaluations/tr1');
    });

    it('says only when a plain test was reported, with nothing further to open', () => {
      renderCard({ timestamp: '2026-09-30T10:00:00.000Z' });

      expect(screen.getByText(/^Reported /)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ranking and evidence' })).not.toBeInTheDocument();
      expect(screen.queryByText('Ranked')).not.toBeInTheDocument();
    });

    it('can be found by its id, so the project\'s list can bring it into view', () => {
      const { container } = renderCard();

      expect(container.querySelector('#evaluation-tr1')).toBeInTheDocument();
    });

    it('is marked only when it is the one that was opened', () => {
      const { container, rerender } = renderCard({}, { highlighted: true });
      expect(container.querySelector('#evaluation-tr1')).toHaveAttribute('aria-current', 'true');

      rerender(
        <MemoryRouter>
          <RunEvaluationCard {...baseProps} evaluation={makeEvaluation()} />
        </MemoryRouter>
      );
      expect(container.querySelector('#evaluation-tr1')).not.toHaveAttribute('aria-current');
    });
  });
});

describe('RunEvaluationCard actions', () => {
  it('has no ranking action: a result with no suite stays a plain evaluation', () => {
    render(
      <MemoryRouter>
        <RunEvaluationCard evaluation={makeEvaluation()} onLatexExport={vi.fn()} onDeleteEvaluation={vi.fn()} isAuthenticated />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /rank on a suite/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export LaTeX' })).toBeInTheDocument();
  });
});
