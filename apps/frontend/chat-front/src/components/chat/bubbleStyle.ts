/** Room kept beside a bubble for the hover icons, on a device that hovers. */
const ACTIONS_ROOM = '6.5rem';

/** How wide a bubble may grow: an analyst's answer is a document and gets the room; a chat line stays a chat line. */
export function bubbleWidth(answer: boolean) {
  return {
    maxWidth: answer ? '94%' : 'min(80%, 34rem)',
    '@media (hover: hover) and (pointer: fine)': {
      maxWidth: answer ? `min(calc(100% - ${ACTIONS_ROOM}), 46rem)` : `min(80%, 34rem, calc(100% - ${ACTIONS_ROOM}))`
    }
  };
}

/** Text sized for a chat panel rather than a page: an answer's paragraphs sit closer than an article's. */
export const bubbleText = {
  fontSize: '0.9375rem',
  lineHeight: 1.5,
  '& .MuiTypography-body1': { fontSize: 'inherit', lineHeight: 'inherit' },
  '& p.MuiTypography-root': { my: 1 },
  '& > :first-child': { mt: 0 },
  '& > :last-child': { mb: 0 }
};
