import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Run } from '../../types/chat';
import { AnalysisSteps } from './AnalysisSteps';

const NOW = new Date('2026-11-10T10:00:10Z');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const run = (patch: Partial<Run> = {}): Run => ({ _id: 'r1', state: 'running', activity: 'Reading results and preparing an answer', ...patch });
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();

it('ticks off what is done, and shows what is being read now with the seconds it has taken', () => {
  render(
    <AnalysisSteps
      run={run({
        steps: [
          { tool: 'list_projects', startedAt: at(9), endedAt: at(8) },
          { tool: 'get_training_curve', startedAt: at(5) }
        ]
      })}
    />
  );
  expect(screen.getByText('Found the project')).toBeInTheDocument();
  expect(screen.getByText('Reading the training curve')).toBeInTheDocument();
  expect(screen.getByText('5s')).toBeInTheDocument();
  expect(screen.queryByText('Reading results and preparing an answer')).not.toBeInTheDocument();
});

it('counts on while a step is still running', () => {
  render(<AnalysisSteps run={run({ steps: [{ tool: 'get_training', startedAt: at(1) }] })} />);
  expect(screen.queryByText('1s')).not.toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(3000));
  expect(screen.getByText('4s')).toBeInTheDocument();
});

it('says what it is doing between steps, with the assistant’s name, and before there is any step', () => {
  const { rerender } = render(<AnalysisSteps run={run({ activity: 'Waiting' })} assistantName="Reviewer" />);
  expect(screen.getByText('Reviewer · Waiting')).toBeInTheDocument();
  rerender(
    <AnalysisSteps run={run({ steps: [{ tool: 'get_project', startedAt: at(3), endedAt: at(2) }] })} />
  );
  expect(screen.getByText('Read the project')).toBeInTheDocument();
  expect(screen.getByText('Reading results and preparing an answer')).toBeInTheDocument();
  rerender(<AnalysisSteps run={run({ activity: '' })} />);
  expect(screen.getByText('Waiting for analyst…')).toBeInTheDocument();
});

it('is announced as a status, and shows a repeated tool as the separate steps they were', () => {
  render(
    <AnalysisSteps
      run={run({
        steps: [
          { tool: 'get_training', startedAt: at(6), endedAt: at(5) },
          { tool: 'get_training', startedAt: at(4), endedAt: at(3) }
        ]
      })}
    />
  );
  expect(screen.getByRole('status', { name: 'The analyst is working' })).toBeInTheDocument();
  expect(screen.getAllByText('Read the run')).toHaveLength(2);
});
