import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import LeaderboardExport from './LeaderboardExport';
import type { ExportTable } from '../../utils/leaderboardExport';

const table = (rows = 1): ExportTable => ({
  suite: { slug: 'road-test', version: 2, name: 'Road', digest: 'd'.repeat(64), headlineKey: 'mIoU', direction: 'max' },
  scope: 'visible',
  page: { page: 1, pages: 2, total: 150 },
  rows: Array.from({ length: rows }, (_, index) => ({ rank: index + 1, model: `m${index}`, evaluationId: `e${index}`, headline: 0.5, worst: { condition: 'night', value: 0.4 }, gap: 0.1 }))
});

afterEach(() => vi.restoreAllMocks());

describe('LeaderboardExport', () => {
  it('opens a dialog with the LaTeX table, and says which page of the ranking it holds', async () => {
    render(<LeaderboardExport table={table()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export this ranking' });
    expect(dialog).toHaveTextContent('page 1 of 2');
    expect((screen.getByLabelText('LaTeX export') as HTMLTextAreaElement).value).toContain('\\begin{table}[t]');
    expect((screen.getByLabelText('LaTeX export') as HTMLTextAreaElement).value).toContain('Evaluations: 1:e0.');
  });

  it('switches to CSV', async () => {
    render(<LeaderboardExport table={table()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'CSV' }));
    expect((screen.getByLabelText('CSV export') as HTMLTextAreaElement).value).toMatch(/^"suite","digest","rank"/);
  });

  it('copies what it shows, and says so', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    render(<LeaderboardExport table={table()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('\\begin{tabular}'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('downloads it as a file named for the suite and version', async () => {
    const created: Blob[] = [];
    vi.stubGlobal('URL', { ...URL, createObjectURL: (blob: Blob) => { created.push(blob); return 'blob:x'; }, revokeObjectURL: vi.fn() });
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    render(<LeaderboardExport table={table()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(names).toEqual(['road-test-v2.tex', 'road-test-v2.csv']);
    expect(created[0].type).toBe('application/x-tex');
    expect(click).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('is disabled when there is nothing to export', () => {
    render(<LeaderboardExport table={table(0)} />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
