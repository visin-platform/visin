/** The same width at every size, so the two kinds of card line up in one grid. */
export const cardGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
  gap: 2
} as const;
