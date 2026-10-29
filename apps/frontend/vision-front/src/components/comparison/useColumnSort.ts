import { useCallback, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/**
 * Which column a table is sorted by and which way. Choosing the current column
 * flips the direction; choosing another starts descending. Spread the result
 * onto `SortableTableCell`.
 */
export function useColumnSort(initialColumn: string, initialDirection: SortDirection) {
  const [sortColumn, setSortColumn] = useState(initialColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  const onSort = useCallback(
    (column: string) => {
      if (column === sortColumn) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(column);
        setSortDirection('desc');
      }
    },
    [sortColumn, sortDirection]
  );

  return { sortColumn, sortDirection, onSort };
}

export interface SortState {
  column: string;
  direction: SortDirection;
}

/**
 * One sort per table, for a page of tables named by a key the data supplies (a
 * condition), so there is no fixed list to seed it from: a table nobody sorted
 * yet reads `initial`. `sortProps(key)` is what `SortableTableCell` takes.
 */
export function useKeyedColumnSort(initial: SortState) {
  const [states, setStates] = useState<Record<string, SortState>>({});

  const sortFor = (key: string): SortState => states[key] ?? initial;

  const onSort = (key: string, column: string) =>
    setStates((previous) => {
      const current = previous[key] ?? initial;
      const next: SortState =
        current.column === column
          ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
          : { column, direction: 'desc' };
      return { ...previous, [key]: next };
    });

  const sortProps = (key: string) => {
    const { column, direction } = sortFor(key);
    return { sortColumn: column, sortDirection: direction, onSort: (next: string) => onSort(key, next) };
  };

  return { sortFor, sortProps };
}
