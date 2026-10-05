import { Box } from '@mui/material';

/**
 * Letters in a small frame, for a platform with no icon in the set. The frame takes the text's colour, so it follows
 * the theme in both schemes.
 */
export function Monogram({ letters }: { letters: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-grid',
        placeItems: 'center',
        width: 20,
        height: 20,
        border: '1.5px solid currentColor',
        borderRadius: '5px',
        fontSize: letters.length > 1 ? 9 : 11,
        fontWeight: 800,
        lineHeight: 1
      }}
    >
      {letters}
    </Box>
  );
}
