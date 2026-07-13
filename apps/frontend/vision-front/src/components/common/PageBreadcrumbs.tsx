import React from 'react';
import {
  Box,
  Breadcrumbs,
  Link as MuiLink,
  Typography,
  SxProps,
  Theme
} from '@mui/material';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface PageBreadcrumbsProps {
  items: BreadcrumbItem[];
  sx?: SxProps<Theme>;
}

const PageBreadcrumbs: React.FC<PageBreadcrumbsProps> = ({ items, sx }) => {
  return (
    <Box sx={{ mb: 3, ...sx }}>
      <Breadcrumbs aria-label="breadcrumb">
        {items.map((item, index) => {
          if (item.current || !item.href) {
            return (
              <Typography key={index} sx={{
                color: "text.primary"
              }}>
                {item.label}
              </Typography>
            );
          }

          return (
            <MuiLink
              key={index}
              component={Link}
              to={item.href}
              underline="hover"
              color="inherit"
            >
              {item.label}
            </MuiLink>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
};

export default PageBreadcrumbs;