import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearVisits, readVisits, recordVisit } from '@visin/frontend-core';
import { RecentSection } from './RecentSection';

const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => now.getTime() - hours * 3600 * 1000;

const renderSection = () =>
  render(
    <MemoryRouter>
      <RecentSection now={now} />
    </MemoryRouter>
  );

beforeEach(() => {
  clearVisits();
});

describe('RecentSection', () => {
  it('says nothing where nothing was visited', () => {
    renderSection();

    expect(screen.queryByText('Recently visited')).not.toBeInTheDocument();
  });

  it('lists what was visited, newest first, with what kind of place it is and how long ago', () => {
    recordVisit({ kind: 'project', id: 'p1', name: 'Window ablations', path: '/projects/window-ablations' }, hoursAgo(5));
    recordVisit({ kind: 'dataset', id: 'd1', name: 'Harbour frames', path: '/datasets/d1' }, hoursAgo(2));
    recordVisit({ kind: 'person', id: 'u1', name: 'Ann Lee', path: '/u/ann-lee' }, hoursAgo(1));
    recordVisit({ kind: 'group', id: 'g1', name: 'Road lab', path: '/g/road-lab' }, hoursAgo(26));
    recordVisit({ kind: 'training', id: 't1', name: 'Run 12', path: '/trainings/t1' }, hoursAgo(30));
    renderSection();

    const rows = within(screen.getByRole('region', { name: 'Recently visited' })).getAllByRole('link');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Ann LeePerson · 1 hour ago',
      'Harbour framesDataset · 2 hours ago',
      'Window ablationsProject · 5 hours ago',
      'Road labGroup · yesterday',
      'Run 12Training · yesterday'
    ]);
    expect(rows[0]).toHaveAttribute('href', '/u/ann-lee');
    expect(rows[2]).toHaveAttribute('href', '/projects/window-ablations');
  });

  it('follows a visit made while it is showing, and forgets everything on Clear', () => {
    recordVisit({ kind: 'project', id: 'p1', name: 'First', path: '/projects/first' }, hoursAgo(3));
    renderSection();
    expect(screen.getByText('First')).toBeInTheDocument();

    act(() => recordVisit({ kind: 'project', id: 'p2', name: 'Second', path: '/projects/second' }, hoursAgo(1)));
    expect(screen.getByText('Second')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear recently visited' }));

    expect(screen.queryByText('Recently visited')).not.toBeInTheDocument();
    expect(readVisits()).toEqual([]);
  });
});
