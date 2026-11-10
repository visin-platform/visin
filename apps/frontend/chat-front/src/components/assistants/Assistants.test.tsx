import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../services/apiClient';
const state = vi.hoisted(() => ({ rows: [] as { _id: string; name: string; personality: string; paused: boolean }[] }));
vi.mock('../../services/apiClient', () => ({
  api: vi.fn(async (path: string, body?: unknown) => {
    if (!body) return state.rows;
    if (path.endsWith('/delete')) state.rows = [];
    else state.rows = [{ _id: 'a1', ...(body as { name: string; personality: string; paused: boolean }) }];
    return {};
  })
}));

import { Assistants } from './Assistants';
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
});
it('creates a reusable assistant and opens it with the reviewed page context', async () => {
  const open = vi.fn();
  render(<Assistants busy={false} onAnalysis={open} pageContext={{ projectId: 'p1', trainingIds: ['t1'] }} />);
  fireEvent.change(await screen.findByRole('textbox', { name: /Assistant name/ }), { target: { value: 'Reviewer' } });
  fireEvent.change(screen.getByLabelText('Communication instructions'), { target: { value: 'Explain assumptions' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create assistant' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reviewer' }));
  expect(open).toHaveBeenCalledWith({ assistantId: 'a1', title: 'Reviewer', projectId: 'p1', trainingIds: ['t1'] });
});
it('edits pause state and requires a deliberate removal confirmation', async () => {
  state.rows = [{ _id: 'a1', name: 'Reviewer', personality: 'Explain assumptions', paused: false }];
  render(<Assistants busy={false} onAnalysis={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Reviewer' }));
  fireEvent.click(screen.getByLabelText('Paused'));
  fireEvent.click(screen.getByRole('button', { name: 'Save assistant' }));
  expect(await screen.findByRole('button', { name: 'Reviewer (paused)' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Reviewer' }));
  expect(api).not.toHaveBeenCalledWith('/assistants/a1/delete', {});
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/assistants/a1/delete', {}));
});

const two = [
  { _id: 'a1', name: 'Vivi', personality: 'Concise', paused: false, isDefault: true },
  { _id: 'a2', name: 'Reviewer', personality: 'Careful', paused: false, isDefault: false }
];

it('shows which assistant answers new analyses, and makes another one the default without changing its settings', async () => {
  state.rows = two as never;
  render(<Assistants busy={false} onAnalysis={vi.fn()} />);

  expect(await screen.findByRole('button', { name: 'Vivi (default analyst)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Stop using Vivi by default' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use Reviewer by default' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/assistants/a2', {
      name: 'Reviewer',
      personality: 'Careful',
      paused: false,
      default: true
    })
  );
});

it('goes back to the built-in analyst when the default is turned off', async () => {
  state.rows = two as never;
  render(<Assistants busy={false} onAnalysis={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Stop using Vivi by default' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/assistants/a1', {
      name: 'Vivi',
      personality: 'Concise',
      paused: false,
      default: false
    })
  );
});

it('does not offer a paused assistant as the default', async () => {
  state.rows = [{ _id: 'a1', name: 'Vivi', personality: '', paused: true, isDefault: false }] as never;
  render(<Assistants busy={false} onAnalysis={vi.fn()} />);
  expect(await screen.findByRole('button', { name: 'Use Vivi by default' })).toBeDisabled();
});
