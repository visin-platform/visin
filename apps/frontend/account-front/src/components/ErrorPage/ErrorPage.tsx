import { Box, Typography, Button } from '@mui/material';
import { ReactNode } from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

/**
 * Props for the ErrorPage component
 */
export interface ErrorPageProps {
  /** The main error title to display */
  title?: string;
  /** The error message content (can be text or React elements) */
  message?: string | ReactNode;
  /** Custom icon to display (defaults to error icon) */
  icon?: ReactNode;
  /** Whether to show the retry button */
  showRetry?: boolean;
  /** Callback function when retry button is clicked */
  onRetry?: () => void;
}

export function ErrorPage({
  title = 'Configuration Error',
  message = (
    <>
      Failed to load application configuration.
      <br />
      Please check your network connection and try again.
    </>
  ),
  icon = <ErrorOutlineIcon sx={{ fontSize: 80, color: 'error.main' }} />,
  showRetry = true,
  onRetry = () => window.location.reload()
}: ErrorPageProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 2
      }}
    >
      {icon}
      <Typography variant="h4" color="error" fontWeight={600} gutterBottom>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center" mb={showRetry ? 2 : 0}>
        {message}
      </Typography>
      {showRetry && (
        <Button variant="contained" color="primary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
