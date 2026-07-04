import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Divider,
  Typography
} from '@mui/material';
import { Epoch } from '../types';

interface EpochsSummaryCardProps {
  epochs: Epoch[];
}

export const EpochsSummaryCard: React.FC<EpochsSummaryCardProps> = ({ epochs }) => {
  const lastEpoch = epochs[epochs.length - 1];

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Epochs Summary
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {epochs.length > 0 ? (
          <Box>
            <Box sx={{
              mb: 2
            }}>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Latest Epoch
              </Typography>
              <Typography variant="h4">
                {epochs[epochs.length - 1]?.epoch}
              </Typography>
            </Box>
            {lastEpoch && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Latest Metrics
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1
                  }}>
                  <Box>
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>Train Loss</Typography>
                    <Typography variant="body2" sx={{
                      fontWeight: 500
                    }}>
                      {lastEpoch.results?.train?.loss?.toFixed(4) || '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>Val Loss</Typography>
                    <Typography variant="body2" sx={{
                      fontWeight: 500
                    }}>
                      {lastEpoch.results?.val?.loss?.toFixed(4) || '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>Train mIoU</Typography>
                    <Typography variant="body2" sx={{
                      fontWeight: 500
                    }}>
                      {lastEpoch.results?.train?.mean_iou?.toFixed(4) || '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>Val mIoU</Typography>
                    <Typography variant="body2" sx={{
                      fontWeight: 500
                    }}>
                      {lastEpoch.results?.val?.mean_iou?.toFixed(4) || '-'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            No epoch data available
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default EpochsSummaryCard;
