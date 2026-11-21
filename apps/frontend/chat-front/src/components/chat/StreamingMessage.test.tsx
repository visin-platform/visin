import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Run, RunStep } from '../../types/chat';
import { StreamingMessage } from './StreamingMessage';

const NOW = new Date('2026-11-10T10:00:10Z');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Reduced motion: text is shown as it arrives rather than typed out.
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
const run = (patch: Partial<Run> = {}): Run => ({ _id: 'r1', state: 'running', activity: 'Reading results and preparing an answer', ...patch });
const note = (thought: string, secondsAgo: number): RunStep => ({ thought, startedAt: at(secondsAgo), endedAt: at(secondsAgo) });

it('shows the answer so far as its author’s message, and is not read out word by word', () => {
  render(<StreamingMessage text={'Validation **peaked** at epoch 42.'} name="Visin analyst" />);
  expect(screen.getByTestId('streaming-message')).toHaveAttribute('aria-live', 'off');
  expect(screen.getByText('Visin analyst')).toBeInTheDocument();
  expect(screen.getByText('peaked').tagName).toBe('STRONG');
});

it('grows as more text arrives', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const { rerender } = render(<StreamingMessage text="Validation" name="Visin analyst" />);
  act(() => void vi.advanceTimersByTime(500));
  expect(screen.getByText('Validation')).toBeInTheDocument();
  rerender(<StreamingMessage text="Validation peaked" name="Visin analyst" />);
  act(() => void vi.advanceTimersByTime(500));
  expect(screen.getByText('Validation peaked')).toBeInTheDocument();
});

it('links the analyst to its profile where it has one, and to nothing where it has not', () => {
  const { rerender } = render(<StreamingMessage text="Hi" name="Visin analyst" profile={{ handle: 'visin-analyst', picture: undefined }} />);
  expect(screen.getByRole('link', { name: 'View Visin analyst profile' })).toHaveAttribute('href', '/u/visin-analyst');
  rerender(<StreamingMessage text="Hi" name="Visin analyst" />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('ticks off what is done, and shows what is being read now with the seconds it has taken', () => {
  render(
    <StreamingMessage
      text=""
      name="Visin analyst"
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
  render(<StreamingMessage text="" name="Visin analyst" run={run({ steps: [{ tool: 'get_training', startedAt: at(1) }] })} />);
  expect(screen.queryByText('1s')).not.toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(3000));
  expect(screen.getByText('4s')).toBeInTheDocument();
});

it('says what it is doing between steps, and before there is any step', () => {
  const { rerender } = render(<StreamingMessage text="" name="Reviewer" run={run({ activity: 'Waiting' })} />);
  expect(screen.getByText('Reviewer')).toBeInTheDocument();
  expect(screen.getByText('Waiting')).toBeInTheDocument();
  rerender(<StreamingMessage text="" name="Reviewer" run={run({ steps: [{ tool: 'get_project', startedAt: at(3), endedAt: at(2) }] })} />);
  expect(screen.getByText('Read the project')).toBeInTheDocument();
  expect(screen.getByText('Reading results and preparing an answer')).toBeInTheDocument();
  rerender(<StreamingMessage text="" name="Reviewer" run={run({ activity: '' })} />);
  expect(screen.getByText('Waiting for analyst…')).toBeInTheDocument();
});

it('is announced as a status, and shows a repeated tool as the separate steps they were', () => {
  render(
    <StreamingMessage
      text=""
      name="Visin analyst"
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

it('shows what the analyst thought as it works, open, in order with what it read', () => {
  render(
    <StreamingMessage
      text=""
      name="Visin analyst"
      run={run({
        steps: [
          note('First the project, to find the baseline run.', 9),
          { tool: 'get_project', startedAt: at(8), endedAt: at(7) },
          note('The baseline is r50; now its curve.', 6),
          { tool: 'get_training_curve', startedAt: at(5) },
          { startedAt: at(4) }
        ]
      })}
    />
  );
  expect(screen.getByRole('button', { name: /Thinking · 2 sources/ })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'First the project, to find the baseline run.',
    'Read the project',
    'The baseline is r50; now its curve.',
    'Reading the training curve5s'
  ]);
});

it('only grows as notes are written and joined to the trail: what is there is never drawn again', () => {
  const first = note('First the project.', 9);
  const read = { tool: 'get_project', startedAt: at(8), endedAt: at(7) };
  const { rerender } = render(<StreamingMessage text="" name="Visin analyst" run={run({ steps: [first, read] })} />);
  const shown = screen.getByText('First the project.');
  // The next note is written under the trail...
  rerender(<StreamingMessage text="Now its curve." name="Visin analyst" run={run({ steps: [first, read] })} />);
  expect(screen.getByText('Now its curve.')).toBeInTheDocument();
  // ...and joins it once the analyst reads.
  rerender(<StreamingMessage text="" name="Visin analyst" run={run({ steps: [first, read, note('Now its curve.', 5)] })} />);
  expect(screen.getAllByText('Now its curve.')).toHaveLength(1);
  expect(screen.getByText('First the project.')).toBe(shown);
});

it('keeps a note in view between leaving the draft and joining the trail, and never shows it twice', () => {
  const first = note('First the project.', 9);
  const { rerender } = render(<StreamingMessage text="Now its curve." name="Visin analyst" run={run({ steps: [first] })} />);
  // The draft is cleared before the note is added to the trail.
  rerender(<StreamingMessage text="" name="Visin analyst" run={run({ steps: [first] })} />);
  expect(screen.getByText('Now its curve.')).toBeInTheDocument();
  // Or the note reaches the trail while the draft still holds it.
  const both = [first, note('Now its curve.', 5)];
  rerender(<StreamingMessage text="Now its curve." name="Visin analyst" run={run({ steps: both })} />);
  expect(screen.getAllByText('Now its curve.')).toHaveLength(1);
  rerender(<StreamingMessage text="" name="Visin analyst" run={run({ steps: both })} />);
  expect(screen.getAllByText('Now its curve.')).toHaveLength(1);
  // A read starts: what was being written is over.
  rerender(<StreamingMessage text="" name="Visin analyst" run={run({ steps: [...both, { tool: 'get_training_curve', startedAt: at(4) }] })} />);
  expect(screen.getAllByText('Now its curve.')).toHaveLength(1);
});
