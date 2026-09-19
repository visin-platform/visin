import { ReactNode } from 'react';
import { Box } from '@mui/material';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * auth-front serves one route, and that page is a full-bleed split: its brand
 * panel is meant to run to the edge of the viewport. A centered `Container`
 * used to sit in between, insetting the split by the container's gutters and
 * capping it at `xl`, which showed as a strip of this background down the side.
 * The Box stays for the background behind anything the page does not cover.
 */
const AppLayout = ({ children }: AppLayoutProps) => {
  return <Box sx={{ minHeight: '100vh', backgroundColor: 'background.paper' }}>{children}</Box>;
};

export default AppLayout;
