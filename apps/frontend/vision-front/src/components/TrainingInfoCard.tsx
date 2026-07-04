import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography
} from '@mui/material';
import { Training } from '../types';

interface TrainingInfoCardProps {
  training: Training;
  getStatusColor: (status: Training['status']) => 'success' | 'error' | 'default' | 'warning';
  formatDate: (dateString: string) => string;
}

export const TrainingInfoCard: React.FC<TrainingInfoCardProps> = ({
  training,
  getStatusColor,
  formatDate
}) => {
  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            mb: 2
          }}>
          <Box>
            <Typography variant="h5" gutterBottom>
              {training.name}
            </Typography>
            {training.description && (
              <Typography variant="body2" component="p" sx={{
                color: "text.secondary",
                mb: 2
              }}>
                {training.description}
              </Typography>
            )}
          </Box>
          <Chip
            label={training.status}
            color={getStatusColor(training.status)}
            sx={{ textTransform: 'capitalize' }}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 2
          }}>
          <Box>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Dataset ID
            </Typography>
            <Typography variant="body2" sx={{
              fontWeight: 500
            }}>
              {training.datasetId || '-'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Training UUID
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                wordBreak: 'break-all'
              }}>
              {training.training_uuid || training.uuid || '-'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Created
            </Typography>
            <Typography variant="body2" sx={{
              fontWeight: 500
            }}>
              {formatDate(training.createdAt)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Last Updated
            </Typography>
            <Typography variant="body2" sx={{
              fontWeight: 500
            }}>
              {formatDate(training.updatedAt)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TrainingInfoCard;
