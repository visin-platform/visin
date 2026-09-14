/**
 * The rounded panel the home page's tiles and lists sit on. Radii are pixels,
 * not theme units: the shell's shape unit is 12px, so `borderRadius: 4` would
 * be 48px.
 */
export const panelSx = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '16px',
  overflow: 'hidden'
} as const;
