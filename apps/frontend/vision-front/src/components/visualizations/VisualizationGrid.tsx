import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Button,
  Tooltip,
  IconButton,
  Divider,
  useTheme
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  Delete as DeleteIcon,
  ZoomIn as ZoomInIcon
} from '@mui/icons-material';
import { Visualization } from '../../types';

interface VisualizationGridProps {
  visualizations: Visualization[];
  selectedForCompare: Visualization[];
  handleCompareToggle: (viz: Visualization) => void;
  handleImageClick: (viz: Visualization) => void;
  handleDelete: (uuid: string) => void;
  isAuthenticated: boolean;
}

const VisualizationGrid: React.FC<VisualizationGridProps> = ({
  visualizations,
  selectedForCompare,
  handleCompareToggle,
  handleImageClick,
  handleDelete,
  isAuthenticated
}) => {
  const theme = useTheme();

  // Group visualizations by type and epoch
  const groupedVisualizations = visualizations.reduce((acc, viz) => {
    const key = `${viz.type}-${viz.epoch}`;
    if (!acc[key]) {
      acc[key] = { type: viz.type, epoch: viz.epoch, items: [] };
    }
    acc[key].items.push(viz);
    return acc;
  }, {} as Record<string, { type: string; epoch?: number; items: Visualization[] }>);

  const onDeleteClick = (uuid: string) => {
    if (confirm('Are you sure you want to delete this visualization?')) {
      handleDelete(uuid);
    }
  };

  return (
    <Box>
      {Object.values(groupedVisualizations).map((group, groupIdx) => (
        <Box key={groupIdx} mb={4}>
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600} sx={{ mr: 2 }}>
              {group.type}
            </Typography>
            {group.epoch !== undefined && (
              <Chip label={`Epoch ${group.epoch}`} size="small" color="primary" variant="outlined" />
            )}
          </Box>
          
          <Grid container spacing={2}>
            {group.items.map(viz => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={viz.visualization_uuid}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    transition: 'all 0.2s',
                    borderColor: selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)
                      ? 'primary.main'
                      : 'divider',
                    borderWidth: selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)
                      ? 2
                      : 1,
                    '&:hover': {
                      borderColor: 'primary.main',
                      transform: 'translateY(-2px)',
                      boxShadow: theme.shadows[2]
                    }
                  }}
                >
                  <Box sx={{ position: 'relative', pt: '75%', bgcolor: 'grey.100', overflow: 'hidden' }}>
                    <CardMedia
                      component="img"
                      image={viz.signedUrl || ''}
                      alt={viz.filename}
                      onClick={() => handleImageClick(viz)}
                      sx={{ 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        cursor: 'pointer',
                        p: 1
                      }}
                    />
                    <Box 
                      className="hover-actions"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        bgcolor: 'rgba(255,255,255,0.8)',
                        borderRadius: 1,
                        '.MuiCard-root:hover &': { opacity: 1 }
                      }}
                    >
                      <Tooltip title="View Full Size">
                        <IconButton size="small" onClick={() => handleImageClick(viz)}>
                          <ZoomInIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  
                  <CardContent sx={{ p: 1.5, flexGrow: 1 }}>
                    <Typography variant="body2" noWrap title={viz.filename} fontWeight={500}>
                      {viz.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {new Date(viz.uploadedAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  
                  <Divider />
                  
                  <CardActions sx={{ p: 1, justifyContent: 'space-between' }}>
                    <Button
                      size="small"
                      startIcon={<CompareIcon />}
                      onClick={() => handleCompareToggle(viz)}
                      disabled={selectedForCompare.length >= 4 && !selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)}
                      color={selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid) ? "primary" : "inherit"}
                    >
                      {selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid) ? 'Selected' : 'Compare'}
                    </Button>
                    {isAuthenticated && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => onDeleteClick(viz.visualization_uuid)}
                          sx={{ 
                            color: 'text.secondary',
                            '&:hover': { color: 'error.main' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
};

export default VisualizationGrid;
