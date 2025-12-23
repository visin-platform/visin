import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Code as CodeIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { comparisonService } from '../services/comparisonService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { generateLatexTable } from '@/utils/comparisonLatexGenerator';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import SelectedEpochPerformance from '@/components/comparison/SelectedEpochPerformance';
import SaveComparisonDialog from '@/components/comparison/SaveComparisonDialog';
import LatexCodeDialog from '@/components/comparison/LatexCodeDialog';

const TrainingComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Set page title
  usePageTitle('Training Comparison - Vision');
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');

  // State for save comparison modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonDescription, setComparisonDescription] = useState('');
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // State for selected epochs (defaults to last epoch)
  const [selectedEpochs, setSelectedEpochs] = useState<Record<string, number>>({});

  // Get training IDs from URL params
  const trainingIds = React.useMemo(() => 
    searchParams.get('ids')?.split(',') || [], 
    [searchParams]
  );

  // Update selected training IDs when trainingIds changes
  React.useEffect(() => {
    setSelectedTrainingIds(trainingIds);
  }, [trainingIds]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainingComparison', trainingIds],
    queryFn: () => trainingService.compareTrainings(trainingIds),
    enabled: trainingIds.length > 0
  });

  const comparisonData = data?.data?.comparison || [];

  // Initialize selected epochs to the epoch with best validation mIoU when data loads
  React.useEffect(() => {
    if (comparisonData.length > 0) {
      const initialSelectedEpochs: Record<string, number> = {};
      comparisonData.forEach(comp => {
        // Find epoch with best validation mean IoU
        let bestEpoch = comp.lastEpoch?.epoch || 0;
        let bestVmIoU = -Infinity;

        comp.epochs.forEach(epoch => {
          const vmIoU = epoch.results?.val?.mean_iou;
          if (vmIoU !== undefined && vmIoU > bestVmIoU) {
            bestVmIoU = vmIoU;
            bestEpoch = epoch.epoch;
          }
        });

        initialSelectedEpochs[comp.training._id] = bestEpoch;
      });
      setSelectedEpochs(initialSelectedEpochs);
    }
  }, [comparisonData]);

  // Handle epoch selection change
  const handleEpochChange = (trainingId: string, epoch: number) => {
    setSelectedEpochs(prev => ({
      ...prev,
      [trainingId]: epoch
    }));
  };

  // Get selected epoch data for a training
  const getSelectedEpochData = (trainingId: string) => {
    const selectedEpoch = selectedEpochs[trainingId];
    const trainingData = comparisonData.find(comp => comp.training._id === trainingId);
    if (!trainingData || !selectedEpoch) return null;
    
    return trainingData.epochs.find(epoch => epoch.epoch === selectedEpoch) || null;
  };

  const handleGenerateLatex = () => {
    const latex = generateLatexTable(comparisonData, getSelectedEpochData);
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  const handleSaveComparison = async () => {
    if (!comparisonName.trim()) return;

    try {
      setSaving(true);
      await comparisonService.createComparison({
        name: comparisonName.trim(),
        description: comparisonDescription.trim(),
        type: 'trainings',
        itemIds: selectedTrainingIds,
      });

      // Reset form and close modal
      setComparisonName('');
      setComparisonDescription('');
      setSelectedTrainingIds(trainingIds);
      setSaveModalOpen(false);

      // Could add a success notification here
    } catch (error) {
      console.error('Error saving comparison:', error);
      // Could add an error notification here
    } finally {
      setSaving(false);
    }
  };

  const handleTrainingIdToggle = (trainingId: string) => {
    setSelectedTrainingIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  if (trainingIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">
          No training IDs provided. Please select trainings to compare from the trainings list.
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/trainings')}>
            Back to Trainings
          </Button>
        </Box>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading training comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Failed to load training comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/trainings')}>
            Back to Trainings
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Training Comparison
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comparing {comparisonData.length} training run{comparisonData.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={handleGenerateLatex}
            disabled={comparisonData.length === 0}
          >
            LaTeX Table
          </Button>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => {
                setSaveModalOpen(true);
                // Reset form when opening modal
                setComparisonName('');
                setComparisonDescription('');
                setSelectedTrainingIds(trainingIds);
              }}
              disabled={comparisonData.length === 0}
              color="secondary"
            >
              Save
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => navigate('/trainings')}
          >
            Back to Trainings
          </Button>
        </Box>
      </Box>

      {/* Detailed Comparison Table */}
      {comparisonData.length > 0 && (
        <ComparisonTable comparisonData={comparisonData} />
      )}

      {/* Selected Epoch Results */}
      {comparisonData.some(comp => getSelectedEpochData(comp.training._id)) && (
        <SelectedEpochPerformance
          comparisonData={comparisonData}
          selectedEpochs={selectedEpochs}
          handleEpochChange={handleEpochChange}
          getSelectedEpochData={getSelectedEpochData}
        />
      )}

      {/* LaTeX Modal */}
      <LatexCodeDialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        latexCode={latexCode}
        copyToClipboard={(text) => navigator.clipboard.writeText(text)}
      />

      {/* Save Comparison Modal */}
      <SaveComparisonDialog
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveComparison}
        comparisonName={comparisonName}
        setComparisonName={setComparisonName}
        comparisonDescription={comparisonDescription}
        setComparisonDescription={setComparisonDescription}
        selectedTrainingIds={selectedTrainingIds}
        handleTrainingIdToggle={handleTrainingIdToggle}
        comparisonData={comparisonData}
        saving={saving}
      />
    </Container>
  );
};

export default TrainingComparisonPage;
