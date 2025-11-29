import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Props for the Loader component
 */
export interface LoaderProps {
  /** The loading message to display below the spinner */
  message?: string;
  /** Size of the loading spinner in pixels */
  size?: number;
  /** Whether to take full viewport height or auto height */
  fullHeight?: boolean;
}

export function Loader({ message = 'Loading...', size = 48, fullHeight = true }: LoaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: fullHeight ? '100vh' : 'auto',
        gap: 2,
        py: fullHeight ? 0 : 8
      }}
    >
      <CircularProgress size={size} />
      <Typography variant="body1" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}
