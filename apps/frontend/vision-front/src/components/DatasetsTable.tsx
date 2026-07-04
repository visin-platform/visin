import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  CircularProgress,
  Box,
  Typography,
  Alert,
  Checkbox,
  useTheme,
  alpha
} from '@mui/material';
import {
  Compare as CompareIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { getAllAnalyses, DatasetAnalysis, deleteAnalysis, updateAnalysis } from '../services/analysisService';
import { useAuth } from '../contexts/AuthContext';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import AnalysisTableRow from './dataset/AnalysisTableRow';
import DeleteAnalysisDialog from './dataset/DeleteAnalysisDialog';
import EditAnalysisDialog from './dataset/EditAnalysisDialog';

interface AnalysisTableProps {
  selectedAnalysisIds?: Set<string>;
  onSelectAnalysis?: (analysisId: string) => void;
  onSelectAll?: (allIds: string[]) => void;
  onCompareSelected?: () => void;
}

export const AnalysisTable: React.FC<AnalysisTableProps> = ({
  selectedAnalysisIds = new Set(),
  onSelectAnalysis = () => { },
  onSelectAll = () => { },
  onCompareSelected = () => { }
}) => {
  const theme = useTheme();
  const { isAuthenticated, user } = useAuth();
  const [actionError, setError] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DatasetAnalysis | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDownloadUrl, setNewDownloadUrl] = useState('');
  const [newDatasetSize, setNewDatasetSize] = useState('');
  const [sortField, setSortField] = useState<'dataset' | 'createdAt' | 'updatedAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const queryClient = useQueryClient();
  const { downloadingId, download } = useDatasetDownload(setError);

  const {
    data,
    isLoading: loading,
    error: loadError
  } = useQuery({
    queryKey: ['analyses'],
    queryFn: () => getAllAnalyses(100)
  });

  const analyses: DatasetAnalysis[] = data?.data || [];
  const error = actionError || (loadError ? 'Failed to load analyses' : null);

  const invalidateAnalyses = () => queryClient.invalidateQueries({ queryKey: ['analyses'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnalysis(id),
    onSuccess: () => {
      invalidateAnalyses();
      setDeleteConfirmOpen(false);
      setSelectedAnalysis(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
    }
  });
  const deleteLoading = deleteMutation.isPending;

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedAnalysis) throw new Error('No analysis selected');
      return updateAnalysis(selectedAnalysis._id, {
        dataset: newDatasetName.trim(),
        size: newDatasetSize.trim() || undefined,
        data: {
          ...selectedAnalysis.data,
          downloadUrl: newDownloadUrl.trim() || undefined
        }
      });
    },
    onSuccess: () => {
      invalidateAnalyses();
      setEditDialogOpen(false);
      setSelectedAnalysis(null);
      setNewDatasetName('');
      setNewDownloadUrl('');
      setNewDatasetSize('');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update analysis');
    }
  });
  const editLoading = updateMutation.isPending;

  const canEditDatasets = () => isAuthenticated;

  const canDeleteDatasets = () =>
    isAuthenticated && user?.groups && (user.groups.includes('owner') || user.groups.includes('admin'));

  const handleDeleteClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedAnalysis) return;
    deleteMutation.mutate(selectedAnalysis._id);
  };

  const handleEditClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setNewDatasetName(analysis.dataset);
    setNewDownloadUrl(analysis.downloadUrl || '');
    setNewDatasetSize(analysis.size || '');
    setEditDialogOpen(true);
  };

  const handleEditConfirm = () => {
    if (!selectedAnalysis || !newDatasetName.trim()) return;
    updateMutation.mutate();
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setSelectedAnalysis(null);
    setNewDatasetName('');
    setNewDownloadUrl('');
    setNewDatasetSize('');
  };

  const handleSort = (field: 'dataset' | 'createdAt' | 'updatedAt') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'createdAt' || field === 'updatedAt' ? 'desc' : 'asc');
    }
  };

  const sortedAnalyses = React.useMemo(() => {
    return [...analyses].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'dataset':
          aValue = a.dataset.toLowerCase();
          bValue = b.dataset.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [analyses, sortField, sortDirection]);

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {selectedAnalysisIds.size > 1 && (
            <Button variant="contained" startIcon={<CompareIcon />} onClick={onCompareSelected} color="primary" size="small">
              Compare
            </Button>
          )}
        </Box>
      </Box>
      {/* Bulk Selection UI */}
      {selectedAnalysisIds.size > 0 && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            borderRadius: 2
          }}
        >
          <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
            {selectedAnalysisIds.size} selected
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {selectedAnalysisIds.size > 1 && (
            <Button variant="outlined" startIcon={<CompareIcon />} onClick={onCompareSelected} size="small" sx={{ borderRadius: 2 }}>
              Compare
            </Button>
          )}
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'hidden'
        }}
      >
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <TableRow>
                <TableCell padding="checkbox" sx={{ fontWeight: 600 }}>
                  <Checkbox
                    indeterminate={selectedAnalysisIds.size > 0 && selectedAnalysisIds.size < sortedAnalyses.length}
                    checked={sortedAnalyses.length > 0 && selectedAnalysisIds.size === sortedAnalyses.length}
                    onChange={() => {
                      if (selectedAnalysisIds.size === sortedAnalyses.length) {
                        onSelectAll?.([]);
                      } else {
                        onSelectAll?.(sortedAnalyses.map(a => a._id));
                      }
                    }}
                    disabled={sortedAnalyses.length === 0}
                  />
                </TableCell>
                <TableCell sx={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => handleSort('dataset')}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Dataset
                    {sortField === 'dataset' && (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                <TableCell sx={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => handleSort('createdAt')}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Created
                    {sortField === 'createdAt' && (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => handleSort('updatedAt')}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Updated
                    {sortField === 'updatedAt' && (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedAnalyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No analyses found
                  </TableCell>
                </TableRow>
              ) : (
                sortedAnalyses.map((analysis) => (
                  <AnalysisTableRow
                    key={analysis._id}
                    analysis={analysis}
                    isSelected={selectedAnalysisIds.has(analysis._id)}
                    onSelect={onSelectAnalysis}
                    canEdit={canEditDatasets()}
                    canDelete={!!canDeleteDatasets()}
                    isDownloading={downloadingId === analysis._id}
                    isDeleting={deleteLoading}
                    isEditing={editLoading}
                    onDownload={download}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <DeleteAnalysisDialog
        open={deleteConfirmOpen}
        loading={deleteLoading}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
      />
      <EditAnalysisDialog
        open={editDialogOpen}
        loading={editLoading}
        datasetName={newDatasetName}
        onDatasetNameChange={setNewDatasetName}
        datasetSize={newDatasetSize}
        onDatasetSizeChange={setNewDatasetSize}
        downloadUrl={newDownloadUrl}
        onDownloadUrlChange={setNewDownloadUrl}
        onCancel={handleEditCancel}
        onConfirm={handleEditConfirm}
      />
    </Box>
  );
};

export default AnalysisTable;
