import { INK, MONO } from '../../theme';

/** The ink panel a code block sits in, the same as the landing page's snippet. */
export const codeFrameSx = {
  my: 3,
  borderRadius: '12px',
  bgcolor: INK,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.06)'
} as const;

export const codeHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  minHeight: 40,
  pl: 2,
  pr: 0.75,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.64)',
  fontFamily: MONO,
  fontSize: '0.78rem'
} as const;

export const codePreSx = {
  m: 0,
  p: 2,
  overflowX: 'auto',
  fontFamily: MONO,
  fontSize: '0.84rem',
  lineHeight: 1.65,
  color: 'rgba(255,255,255,0.88)',
  // Shiki colours each token inline; the panel supplies the background.
  bgcolor: 'transparent',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.light', outlineOffset: -2 }
} as const;
