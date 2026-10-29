import React from 'react';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { Timeline as TimelineIcon } from '@mui/icons-material';

interface ChartCardProps {
  title: string;
  /** A line of explanation under the title; left out when there is none to give. */
  description?: string;
  /** Colour of the icon beside the title. */
  color: 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  /** Marks the card for the in-app guide. */
  dataGuide?: string;
  /** Space under the description, in theme spacing units. */
  descriptionGap?: number;
  children: React.ReactNode;
}

/** A half-width card on the overview: an icon and title, a line of explanation, then the chart. */
const ChartCard: React.FC<ChartCardProps> = ({ title, description, color, dataGuide, descriptionGap = 2, children }) => (
  <Grid size={{ xs: 12, md: 6 }}>
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }} data-guide={dataGuide}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <TimelineIcon color={color} sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        {description ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: descriptionGap }}>
            {description}
          </Typography>
        ) : (
          <Box sx={{ mb: descriptionGap - 1 }} />
        )}
        {children}
      </CardContent>
    </Card>
  </Grid>
);

export default ChartCard;
