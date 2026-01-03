import React, { useState } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { comparisonService } from '../../services/comparisonService';
import { trainingService } from '../../services/trainingService';
import { testResultService } from '../../services/testResultService';
import { benchmarkService } from '../../services/benchmarkService';
import { Comparison, TestResult } from '../../types';

interface ProjectComparisonsTabProps {
  projectId: string;
}

type ComparisonType = 'trainings' | 'tests' | 'benchmarks';

interface Item {
  _id: string;
  name?: string;
}

const ProjectComparisonsTab: React.FC<ProjectComparisonsTabProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ComparisonType>('trainings');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [comparisonTitle, setComparisonTitle] = useState('');
  const [comparisonDescription, setComparisonDescription] = useState('');
  
  // Edit state
  const [editingComparison, setEditingComparison] = useState<Comparison | null>(null);
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<Comparison | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch comparisons for this project
  const { data: comparisonsResponse, isLoading: isComparisonsLoading } = useQuery({
    queryKey: ['project-comparisons', projectId],
    queryFn: () => comparisonService.getComparisons({ projectId }),
  });

  // Fetch trainings for the project
  const { data: trainingsResponse, isLoading: isTrainingsLoading } = useQuery({
    queryKey: ['project-trainings-list', projectId],
    queryFn: () => trainingService.getTrainings({ projectId, limit: 100 }),
    enabled: selectedType === 'trainings' && modalOpen
  });

  // Fetch test results for the project
  const { data: testsResponse, isLoading: isTestsLoading } = useQuery({
    queryKey: ['project-tests-list', projectId],
    queryFn: () => testResultService.getTestResults({ projectId, limit: 100 }),
    enabled: selectedType === 'tests' && modalOpen
  });

  // Fetch benchmarks for the project
  const { data: benchmarksResponse, isLoading: isBenchmarksLoading } = useQuery({
    queryKey: ['project-benchmarks-list', projectId],
    queryFn: () => benchmarkService.getBenchmarks({ projectId, limit: 100 }),
    enabled: selectedType === 'benchmarks' && modalOpen
  });

  // Create/update comparison mutation
  const saveComparisonMutation = useMutation({
    mutationFn: (data: { id?: string; name: string; description?: string; type: ComparisonType; itemIds: string[]; projectId?: string; metadata?: any }) => {
      if (data.id) {
        return comparisonService.updateComparison(data.id, {
          name: data.name,
          description: data.description,
          type: data.type,
          itemIds: data.itemIds,
          metadata: data.metadata
        });
      } else {
        return comparisonService.createComparison({
          name: data.name,
          description: data.description,
          type: data.type,
          itemIds: data.itemIds,
          projectId: data.projectId,
          metadata: data.metadata
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-comparisons', projectId] });
      handleCloseModal();
    }
  });

  // Delete comparison mutation
  const deleteComparisonMutation = useMutation({
    mutationFn: (id: string) => comparisonService.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-comparisons', projectId] });
      setDeleteDialogOpen(false);
      setComparisonToDelete(null);
      setIsDeleting(false);
    },
    onError: () => {
      setIsDeleting(false);
    }
  });

  const handleOpenModal = (comparison?: Comparison) => {
    if (comparison) {
      // Editing mode
      setEditingComparison(comparison);
      setComparisonTitle(comparison.name);
      setComparisonDescription(comparison.description || '');
      setSelectedType(comparison.type as ComparisonType);
      setSelectedItems(comparison.itemIds);
    } else {
      // Creating mode
      setEditingComparison(null);
      setComparisonTitle('');
      setComparisonDescription('');
      setSelectedType('trainings');
      setSelectedItems([]);
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingComparison(null);
    setSelectedType('trainings');
    setSelectedItems([]);
    setComparisonTitle('');
    setComparisonDescription('');
  };

  const handleTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedType(event.target.value as ComparisonType);
    setSelectedItems([]);
  };

  const handleItemToggle = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : prev.length < 20 ? [...prev, itemId] : prev
    );
  };

  const handleSaveComparison = () => {
    if (!comparisonTitle.trim() || selectedItems.length === 0) return;

    saveComparisonMutation.mutate({
      id: editingComparison?._id,
      name: comparisonTitle.trim(),
      description: comparisonDescription.trim() || undefined,
      type: selectedType,
      itemIds: selectedItems,
      projectId: editingComparison ? undefined : projectId // Only set projectId for new comparisons
    });
  };

  const handleEditComparison = (comparison: Comparison) => {
    handleOpenModal(comparison);
  };

  const handleDeleteComparison = (comparison: Comparison) => {
    setComparisonToDelete(comparison);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (comparisonToDelete) {
      setIsDeleting(true);
      deleteComparisonMutation.mutate(comparisonToDelete._id);
    }
  };

  const handleNewComparison = () => {
    handleOpenModal();
  };

  const handleComparisonClick = (comparison: Comparison) => {
    // Navigate to appropriate comparison page
    const ids = comparison.itemIds.join(',');
    switch (comparison.type) {
      case 'trainings':
        navigate(`/trainings/compare?ids=${ids}`);
        break;
      case 'tests':
        navigate(`/test-results/compare?ids=${ids}`);
        break;
      case 'benchmarks':
        navigate(`/benchmarks/compare?ids=${ids}`);
        break;
      default:
        break;
    }
  };

  const getItemsForType = (): Item[] => {
    switch (selectedType) {
      case 'trainings':
        return trainingsResponse?.data?.trainings || [];
      case 'tests':
        return (testsResponse?.data?.testResults || []).map((testResult: TestResult) => ({
          _id: testResult._id,
          name: testResult.training 
            ? `${testResult.training.name} - Epoch ${testResult.epoch}`
            : `Test ${testResult.test_uuid} - Epoch ${testResult.epoch}`
        }));
      case 'benchmarks':
        return (benchmarksResponse?.data?.benchmarks || []).map(benchmark => ({
          _id: benchmark._id,
          name: (benchmark.training_id && typeof benchmark.training_id === 'object' && 'name' in benchmark.training_id) 
            ? benchmark.training_id.name 
            : (benchmark.training_uuid ? 'Unknown Training' : 'Standalone')
        }));
      default:
        return [];
    }
  };

  const isLoadingItems = 
    (selectedType === 'trainings' && isTrainingsLoading) ||
    (selectedType === 'tests' && isTestsLoading) ||
    (selectedType === 'benchmarks' && isBenchmarksLoading);

  const comparisons: Comparison[] = comparisonsResponse?.data?.comparisons || [];

  return (
    <Box sx={{ px: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" gutterBottom>Comparisons</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleNewComparison}
        >
          New Comparison
        </Button>
      </Box>

      {isComparisonsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : comparisons.length === 0 ? (
        <Alert severity="info">No comparisons found. Create your first comparison to get started.</Alert>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {comparisons.map((comparison) => (
                <TableRow 
                  key={comparison._id} 
                  hover 
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleComparisonClick(comparison)}
                >
                  <TableCell>{comparison.name}</TableCell>
                  <TableCell>
                    <Chip 
                      label={comparison.type} 
                      size="small" 
                      color="primary" 
                      variant="outlined" 
                    />
                  </TableCell>
                  <TableCell>{comparison.itemIds.length} items</TableCell>
                  <TableCell>{new Date(comparison.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="Edit comparison">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditComparison(comparison);
                          }}
                          sx={{ color: theme.palette.text.secondary, '&:hover': { color: theme.palette.primary.main } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete comparison">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteComparison(comparison);
                          }}
                          sx={{ color: theme.palette.text.secondary, '&:hover': { color: theme.palette.error.main } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Comparison Modal */}
      <Dialog open={modalOpen} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <DialogTitle>{editingComparison ? 'Edit Comparison' : 'Create New Comparison'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Comparison Title"
              value={comparisonTitle}
              onChange={(e) => setComparisonTitle(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={comparisonDescription}
              onChange={(e) => setComparisonDescription(e.target.value)}
              multiline
              rows={2}
              sx={{ mb: 3 }}
            />

            <FormControl component="fieldset" sx={{ mb: 3 }}>
              <FormLabel component="legend">Category</FormLabel>
              <RadioGroup
                row
                value={selectedType}
                onChange={handleTypeChange}
              >
                <FormControlLabel value="trainings" control={<Radio />} label="Trainings" />
                <FormControlLabel value="tests" control={<Radio />} label="Tests" />
                <FormControlLabel value="benchmarks" control={<Radio />} label="Benchmarks" />
              </RadioGroup>
            </FormControl>

            <Typography variant="h6" sx={{ mb: 2 }}>
              Select Items ({selectedItems.length}/20)
            </Typography>

            {isLoadingItems ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                {getItemsForType().map((item) => (
                  <ListItem key={item._id} dense>
                    <Checkbox
                      checked={selectedItems.includes(item._id)}
                      onChange={() => handleItemToggle(item._id)}
                      disabled={!selectedItems.includes(item._id) && selectedItems.length >= 20}
                    />
                    <ListItemText primary={item.name} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button 
            onClick={handleSaveComparison} 
            variant="contained"
            disabled={!comparisonTitle.trim() || selectedItems.length === 0 || saveComparisonMutation.isPending}
          >
            {saveComparisonMutation.isPending ? <CircularProgress size={20} /> : (editingComparison ? 'Update' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Comparison Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Comparison</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{comparisonToDelete?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectComparisonsTab;