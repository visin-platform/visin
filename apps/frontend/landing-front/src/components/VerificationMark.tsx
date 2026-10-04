import { Box, Tooltip } from '@mui/material';
import { CheckCircleOutlined } from '@mui/icons-material';

/** A verification label, accessible by keyboard as well as on hover. */
export default function VerificationMark({ verified }: { verified: boolean }) {
  return <Tooltip describeChild title={verified ? 'Verified by a manager or an automated job.' : 'Not yet verified by a manager or an automated job.'}>
    <Box component="span" role="img" aria-label={verified ? 'Verified' : 'Not verified'} tabIndex={0} sx={{ display: 'inline-flex', verticalAlign: 'middle', color: verified ? 'success.main' : 'text.disabled' }}>
      <CheckCircleOutlined fontSize="small" />
    </Box>
  </Tooltip>;
}
