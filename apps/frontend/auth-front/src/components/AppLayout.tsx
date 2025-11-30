import { ReactNode } from 'react';
import Container from '@mui/material/Container';
import { Box } from '@mui/material';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Container maxWidth="xl">{children}</Container>
    </Box>
  );
};

export default AppLayout;
