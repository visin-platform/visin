import { useTheme, useMediaQuery } from '@mui/material';

export const useMobileChartTooltip = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // For mobile, we'll use CSS to adjust tooltip positioning
  return {
    isMobile
  };
};