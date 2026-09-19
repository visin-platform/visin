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
import { ChevronLeft } from '@mui/icons-material';
import { useCompactLayout } from '@visin/frontend-core';

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
  const compact = useCompactLayout();

  // A trail of one leads nowhere: the page is a top-level section the app bar
  // already names.
  if (items.length < 2) {
    return null;
  }

  // On a phone a four-level trail wrapped over three lines. What it is used for
  // there is going back one step, so that is all it offers — an app's back link.
  if (compact) {
    const parent = [...items].reverse().find((item) => item.href && !item.current);
    if (!parent) return null;
    return (
      <Box sx={{ mb: 1.5, ...sx }}>
        <MuiLink
          component={Link}
          to={parent.href!}
          underline="none"
          sx={{ display: 'inline-flex', alignItems: 'center', ml: -0.75, fontWeight: 600, fontSize: '0.9rem' }}
        >
          <ChevronLeft fontSize="small" />
          {parent.label}
        </MuiLink>
      </Box>
    );
  }

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