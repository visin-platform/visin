import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  clearVisits,
  readVisits,
  recordVisit,
  useRecentVisits,
  useTrackVisit,
  type Visit
} from './recentVisits';

const visit = (overrides: Partial<Omit<Visit, 'visitedAt'>> = {}) => ({
  kind: 'project' as const,
  id: 'p1',
  name: 'Window ablations',
  path: '/projects/window-ablations',
  ...overrides
});

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('recording visits', () => {
  it('keeps what was visited, newest first', () => {
    recordVisit(visit(), 1000);
    recordVisit(visit({ kind: 'dataset', id: 'd1', name: 'Frames', path: '/datasets/d1' }), 2000);

    expect(readVisits().map((held) => [held.kind, held.name, held.visitedAt])).toEqual([
      ['dataset', 'Frames', 2000],
      ['project', 'Window ablations', 1000]
    ]);
  });

  it('moves a place opened again to the front, and renames it, instead of listing it twice', () => {
    recordVisit(visit(), 1000);
    recordVisit(visit({ kind: 'dataset', id: 'd1', name: 'Frames', path: '/datasets/d1' }), 2000);
    recordVisit(visit({ name: 'Window ablations v2' }), 3000);

    expect(readVisits().map((held) => held.name)).toEqual(['Window ablations v2', 'Frames']);
  });

  it('tells a project from a dataset that happens to share its id', () => {
    recordVisit(visit({ id: 'same' }), 1000);
    recordVisit(visit({ kind: 'dataset', id: 'same', path: '/datasets/same' }), 2000);

    expect(readVisits()).toHaveLength(2);
  });

  it('keeps ten, dropping the oldest', () => {
    for (let index = 0; index < 12; index += 1) recordVisit(visit({ id: `p${index}`, name: `P${index}`, path: `/projects/p${index}` }), index);

    const held = readVisits();
    expect(held).toHaveLength(10);
    expect(held[0].name).toBe('P11');
    expect(held[9].name).toBe('P2');
  });

  it('forgets all of them', () => {
    recordVisit(visit(), 1000);
    recordVisit(visit({ id: 'p2', name: 'Two', path: '/projects/two' }), 2000);

    clearVisits();
    expect(readVisits()).toEqual([]);
    expect(localStorage.getItem('visin-recent')).toBeNull();
  });
});

describe('what is read back', () => {
  it('is empty with nothing stored, and for anything that is not a list of visits', () => {
    expect(readVisits()).toEqual([]);
    for (const stored of ['not json', '{"a":1}', 'null', '"text"']) {
      localStorage.setItem('visin-recent', stored);
      expect(readVisits()).toEqual([]);
    }
  });

  it('skips an entry that is not a visit, or whose path leaves the app, and keeps the rest', () => {
    const good = { kind: 'project', id: 'p1', name: 'Good', path: '/projects/p1', visitedAt: 1 };
    localStorage.setItem(
      'visin-recent',
      JSON.stringify([
        good,
        null,
        'text',
        { ...good, kind: 'spaceship' },
        { ...good, id: 7 },
        { ...good, name: 7 },
        { ...good, path: 'https://elsewhere.test/' },
        { ...good, visitedAt: 'now' }
      ])
    );

    expect(readVisits()).toEqual([good]);
  });

  it('puts them in order and keeps ten, whatever order and number were stored', () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ kind: 'project', id: `p${index}`, name: `P${index}`, path: `/p/${index}`, visitedAt: index }));
    localStorage.setItem('visin-recent', JSON.stringify(many));

    const held = readVisits();
    expect(held).toHaveLength(10);
    expect(held[0].name).toBe('P13');
  });
});

describe('where storage is not available', () => {
  const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
  const blocked = () => {
    throw new Error('blocked');
  };

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', real);
  });

  it('reads nothing and writes nothing, without failing the page that tried', () => {
    // Reading `localStorage` itself can throw (blocked site data), as can each call on it.
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: blocked, setItem: blocked, removeItem: blocked } });
    const noted = vi.fn();
    window.addEventListener('visin:recent-visits', noted);
    try {
      expect(() => recordVisit(visit())).not.toThrow();
      expect(() => clearVisits()).not.toThrow();
      expect(readVisits()).toEqual([]);
      // Whoever is showing the list is still told something changed, and finds it empty.
      expect(noted).toHaveBeenCalled();
    } finally {
      window.removeEventListener('visin:recent-visits', noted);
    }
  });

  it('reads nothing when the storage object itself throws on access', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: blocked });

    expect(readVisits()).toEqual([]);
    expect(() => recordVisit(visit())).not.toThrow();
  });
});

describe('useRecentVisits', () => {
  it('shows what is stored, and follows changes made anywhere on the page', () => {
    recordVisit(visit(), 1000);
    const { result } = renderHook(() => useRecentVisits());
    expect(result.current.map((held) => held.name)).toEqual(['Window ablations']);

    act(() => recordVisit(visit({ id: 'p2', name: 'Two', path: '/projects/two' }), 2000));
    expect(result.current.map((held) => held.name)).toEqual(['Two', 'Window ablations']);

    act(() => clearVisits());
    expect(result.current).toEqual([]);
  });

  it('follows another tab, and gives the same list while nothing changed', () => {
    const { result, rerender } = renderHook(() => useRecentVisits());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    act(() => {
      localStorage.setItem('visin-recent', JSON.stringify([{ ...visit(), visitedAt: 5 }]));
      window.dispatchEvent(new Event('storage'));
    });
    expect(result.current.map((held) => held.name)).toEqual(['Window ablations']);
  });
});

describe('useTrackVisit', () => {
  const Page = ({ shown }: { shown: Omit<Visit, 'visitedAt'> | null }) => {
    useTrackVisit(shown);
    return <p>page</p>;
  };

  it('notes the page once what it shows has loaded, and not before', () => {
    const { rerender } = render(<Page shown={null} />);
    expect(readVisits()).toEqual([]);

    rerender(<Page shown={visit()} />);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(readVisits().map((held) => held.name)).toEqual(['Window ablations']);
  });

  it('notes nothing for a page with no name or path to give', () => {
    render(<Page shown={visit({ name: '' })} />);
    render(<Page shown={visit({ path: '' })} />);

    expect(readVisits()).toEqual([]);
  });

  it('does not note the same page again for a render that changed nothing, but does for a new name', () => {
    const noted = vi.fn();
    window.addEventListener('visin:recent-visits', noted);
    try {
      const { rerender } = render(<Page shown={visit()} />);
      rerender(<Page shown={visit()} />);
      expect(noted).toHaveBeenCalledTimes(1);

      rerender(<Page shown={visit({ name: 'Renamed' })} />);
      expect(noted).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('visin:recent-visits', noted);
    }
  });
});
