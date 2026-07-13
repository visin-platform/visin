import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Card,
  CardContent,
  Checkbox,
  Chip
} from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { comparisonService } from '../../services/comparisonService';

// getVisualizationsByTraining('', ...) — an empty training_uuid — always
// resolves to the grouped-by-training shape, never the paginated one. Only
// training_uuid/training_name/visualizations[].type are read below, so the
// prop is typed against that rather than the full Visualization shape.
interface TrainingVisualizationsSummary {
  training_uuid: string;
  training_name: string;
  visualizations: Array<{ type: string }>;
}

export interface VisualizationsGroupedResult {
  success: boolean;
  data: { trainings: TrainingVisualizationsSummary[] };
}

interface ProjectVisualizationsTabProps {
  projectId: string;
  visualizationsResponse: VisualizationsGroupedResult | undefined;
  isLoading: boolean;
}

const ProjectVisualizationsTab: React.FC<ProjectVisualizationsTabProps> = ({
  projectId,
  visualizationsResponse,
  isLoading
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedVisualizationTrainingIds, setSelectedVisualizationTrainingIds] = useState<Set<string>>(new Set());

  // Create comparison mutation
  const createComparisonMutation = useMutation({
    mutationFn: (data: { name: string; itemIds: string[]; projectId: string }) =>
      comparisonService.createComparison({
        name: data.name,
        type: 'trainings',
        itemIds: data.itemIds,
        projectId: data.projectId
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['project-comparisons', projectId] });
      navigate(`/comparisons/${response.data.uuid}`);
    }
  });

  return (
    <Box sx={{ px: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Visualizations</Typography>
        {selectedVisualizationTrainingIds.size > 0 && (
          <Button
            variant="contained"
            startIcon={<CompareIcon />}
            onClick={() => {
              const selectedIds = Array.from(selectedVisualizationTrainingIds);
              const comparisonName = `Comparison of ${selectedIds.length} trainings (from visualizations)`;
              createComparisonMutation.mutate({
                name: comparisonName,
                itemIds: selectedIds,
                projectId: projectId
              });
            }}
          >
            Compare Selected ({selectedVisualizationTrainingIds.size})
          </Button>
        )}
      </Box>
      {isLoading ? (
        <CircularProgress />
      ) : visualizationsResponse?.data?.trainings && visualizationsResponse.data.trainings.length > 0 ? (
        <>
          {visualizationsResponse.data.trainings.map((training) => (
            <Card key={training.training_uuid} sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Checkbox
                    checked={selectedVisualizationTrainingIds.has(training.training_uuid)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedVisualizationTrainingIds);
                      if (e.target.checked) {
                        newSelected.add(training.training_uuid);
                      } else {
                        newSelected.delete(training.training_uuid);
                      }
                      setSelectedVisualizationTrainingIds(newSelected);
                    }}
                  />
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {training.training_name}
                  </Typography>
                  <Chip
                    label={`${training.visualizations.length} visualization${training.visualizations.length !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ ml: 2 }}
                  />
                </Box>
                {training.visualizations.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    {(() => {
                      const typeCounts = training.visualizations.reduce((acc: { [key: string]: number }, viz) => {
                        acc[viz.type] = (acc[viz.type] || 0) + 1;
                        return acc;
                      }, {});
                      return Object.entries(typeCounts).map(([type, count]) => (
                        <Chip
                          key={type}
                          label={`${type}: ${count}`}
                          size="small"
                          variant="outlined"
                        />
                      ));
                    })()}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    No visualizations for this training.
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      ) : (
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No visualizations found for this project.
        </Typography>
      )}
    </Box>
  );
};

export default ProjectVisualizationsTab;
