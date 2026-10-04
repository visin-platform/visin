import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';

const suites = vi.hoisted(() => ({ submissions: vi.fn(), update: vi.fn() }));
const evaluations = vi.hoisted(() => ({ approve: vi.fn(), hide: vi.fn(), unhide: vi.fn() }));
vi.mock('../../services/evaluationService', () => ({ suiteService: suites, evaluationService: evaluations }));

import SubmissionsPanel from './SubmissionsPanel';
import { renderWithClient } from '../../test/renderWithClient';
import type { Suite, SuiteSubmissions } from '../../types/evaluation';

const suite = { slug: 'road-test', version: 1, submissions: 'approval' } as Suite;
const row = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  evaluationId: id,
  checkpoint: { kind: 'local' as const, label, sha256: 'a'.repeat(64) },
  project: { name: 'Visitors' },
  headline: { key: 'mIoU', value: 0.7351 },
  publishedAt: '2026-10-02T00:00:00.000Z',
  ...over
});
const queue = (over: Partial<SuiteSubmissions> = {}): SuiteSubmissions => ({
  suite: { slug: 'road-test', version: 1, submissions: 'approval' },
  pending: [row('e1', 'Theirs')],
  hidden: [row('e2', 'Hidden one', { hidden: { at: '2026-10-03T00:00:00.000Z', reason: 'Scores do not match the paper' } })],
  ...over
});

describe('SubmissionsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    suites.submissions.mockResolvedValue(queue());
    suites.update.mockResolvedValue({});
    evaluations.approve.mockResolvedValue(undefined);
    evaluations.hide.mockResolvedValue(undefined);
    evaluations.unhide.mockResolvedValue(undefined);
  });

  it('shows nothing to someone who may not manage the suite, because the API refuses them', async () => {
    suites.submissions.mockRejectedValue(new Error('Manage access to the suite\'s project is required'));
    renderWithClient(<SubmissionsPanel suite={suite} />);
    await waitFor(() => expect(suites.submissions).toHaveBeenCalledWith('road-test', '1'));
    expect(screen.queryByText('Who can publish here')).not.toBeInTheDocument();
  });

  it('lists what waits and what was hidden, and says what the policy lets others do', async () => {
    renderWithClient(<SubmissionsPanel suite={suite} />);
    expect(await screen.findByText('Who can publish here')).toBeInTheDocument();
    expect(screen.getByText(/remain visible on the leaderboard/)).toBeInTheDocument();
    const waiting = screen.getByRole('table', { name: 'Results awaiting verification' });
    expect(within(waiting).getByText('Theirs')).toBeInTheDocument();
    expect(within(waiting).getByText('Visitors')).toBeInTheDocument();
    expect(within(waiting).getByText('0.7351')).toBeInTheDocument();
    const hidden = screen.getByRole('table', { name: 'Hidden results' });
    expect(within(hidden).getByText('Scores do not match the paper')).toBeInTheDocument();
  });

  it('approves a pending result and shows a hidden one again', async () => {
    renderWithClient(<SubmissionsPanel suite={suite} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(evaluations.approve).toHaveBeenCalledWith('e1'));
    await userEvent.click(screen.getByRole('button', { name: 'Show again' }));
    await waitFor(() => expect(evaluations.unhide).toHaveBeenCalledWith('e2'));
  });

  it('will not hide a result without a reason, and sends the reason with it', async () => {
    renderWithClient(<SubmissionsPanel suite={suite} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide' }));
    const dialog = await screen.findByRole('dialog');
    const hide = within(dialog).getByRole('button', { name: 'Hide' });
    expect(hide).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), ' Not our protocol ');
    await userEvent.click(hide);
    await waitFor(() => expect(evaluations.hide).toHaveBeenCalledWith('e1', 'Not our protocol'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says why hiding failed and keeps the dialog open', async () => {
    evaluations.hide.mockRejectedValue(new Error('Only a published result can be hidden from a leaderboard.'));
    renderWithClient(<SubmissionsPanel suite={suite} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hide' }));
    expect(await within(dialog).findByText('Only a published result can be hidden from a leaderboard.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changes the policy, and reports a refusal', async () => {
    renderWithClient(<SubmissionsPanel suite={suite} />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Publishing to this suite' }));
    await userEvent.click(await screen.findByRole('option', { name: 'This project only' }));
    await waitFor(() => expect(suites.update).toHaveBeenCalledWith('road-test', '1', { submissions: 'members' }));
    suites.update.mockRejectedValue(new Error('Manage access to the project is required'));
    await userEvent.click(screen.getByRole('combobox', { name: 'Publishing to this suite' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Open' }));
    expect(await screen.findByText('Manage access to the project is required')).toBeInTheDocument();
  });

  it('draws no empty lists', async () => {
    suites.submissions.mockResolvedValue(queue({ pending: [], hidden: [], suite: { slug: 'road-test', version: 1, submissions: 'open' } }));
    renderWithClient(<SubmissionsPanel suite={{ ...suite, submissions: 'open' }} />);
    expect(await screen.findByText(/A manager of any public project can publish its results here/)).toBeInTheDocument();
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden from the leaderboard')).not.toBeInTheDocument();
  });
});
