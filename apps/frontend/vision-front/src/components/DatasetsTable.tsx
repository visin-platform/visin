import React, { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Box,
  Typography,
  Alert,
  Checkbox,
  Tooltip,
  IconButton,
  TextField,
  useTheme,
  alpha
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Compare as CompareIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { getAllAnalyses, DatasetAnalysis, deleteAnalysis, updateAnalysis } from '../services/analysisService';
import { datasetService, Dataset } from '../services/datasetService';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils';

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
  const [analyses, setAnalyses] = useState<DatasetAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DatasetAnalysis | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDownloadUrl, setNewDownloadUrl] = useState('');
  const [newDatasetSize, setNewDatasetSize] = useState('');
  const [sortField, setSortField] = useState<'dataset' | 'createdAt' | 'updatedAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllAnalyses(100);
      setAnalyses(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  // Permission check function
  const canEditDatasets = () => {
    return isAuthenticated;
  };

  const canDeleteDatasets = () => {
    return isAuthenticated && user?.groups && (user.groups.includes('owner') || user.groups.includes('admin'));
  };

  const handleDeleteClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedAnalysis) return;

    try {
      setDeleteLoading(true);
      await deleteAnalysis(selectedAnalysis._id);
      setAnalyses(analyses.filter((a) => a._id !== selectedAnalysis._id));
      setDeleteConfirmOpen(false);
      setSelectedAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
  };

  const handleEditClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setNewDatasetName(analysis.dataset);
    setNewDownloadUrl(analysis.downloadUrl || '');
    setNewDatasetSize(analysis.size || '');
    setEditDialogOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!selectedAnalysis || !newDatasetName.trim()) return;

    try {
      setEditLoading(true);
      await updateAnalysis(selectedAnalysis._id, {
        dataset: newDatasetName.trim(),
        size: newDatasetSize.trim() || undefined,
        data: {
          ...selectedAnalysis.data,
          downloadUrl: newDownloadUrl.trim() || undefined
        }
      });

      // Update the local state
      setAnalyses(analyses.map(a =>
        a._id === selectedAnalysis._id
          ? {
            ...a,
            dataset: newDatasetName.trim(),
            size: newDatasetSize.trim() || undefined,
            downloadUrl: newDownloadUrl.trim() || undefined
          }
          : a
      ));

      setEditDialogOpen(false);
      setSelectedAnalysis(null);
      setNewDatasetName('');
      setNewDownloadUrl('');
      setNewDatasetSize('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update analysis');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setSelectedAnalysis(null);
    setNewDatasetName('');
    setNewDownloadUrl('');
    setNewDatasetSize('');
  };

  const handleDownload = async (analysis: DatasetAnalysis) => {
    try {
      setDownloadLoading(analysis._id);

      // If analysis has a direct download URL, use it
      if (analysis.downloadUrl) {
        // Check if it's a MinIO path that needs signing
        if (analysis.downloadUrl.startsWith('minio:')) {
          const minioPath = analysis.downloadUrl.substring(6); // Remove 'minio:' prefix
          try {
            // Generate signed URL for the MinIO path
            const signedUrlData = await datasetService.getSignedUrl(minioPath);
            const link = document.createElement('a');
            link.href = signedUrlData.signedUrl;
            link.download = `${analysis.dataset}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          } catch (err) {
            setError('Failed to generate download URL for MinIO path');
            return;
          }
        } else if (analysis.downloadUrl.startsWith('datasets/')) {
          // Treat as MinIO path (bucket path starting with datasets/)
          try {
            const signedUrlData = await datasetService.getSignedUrl(analysis.downloadUrl);
            const link = document.createElement('a');
            link.href = signedUrlData.signedUrl;
            link.download = `${analysis.dataset}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          } catch (err) {
            setError('Failed to generate download URL for MinIO path');
            return;
          }
        } else {
          // Direct URL
          const link = document.createElement('a');
          link.href = analysis.downloadUrl;
          link.download = `${analysis.dataset}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }
      }

      // Otherwise, fall back to dataset lookup
      const datasets = await datasetService.getDatasets({ search: analysis.dataset, limit: 1 });
      const dataset = datasets.data.datasets.find((d: Dataset) => d.name === analysis.dataset);

      if (!dataset?.uuid) {
        setError('Dataset not found or missing UUID');
        return;
      }

      const downloadData = await datasetService.downloadDataset(dataset.uuid);

      // Use the download URL
      if (downloadData.downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadData.downloadUrl;
        link.download = `${analysis.dataset}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        setError('No download URL available');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download dataset');
    } finally {
      setDownloadLoading(null);
    }
  };

  const handleSort = (field: 'dataset' | 'createdAt' | 'updatedAt') => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending except for dates which default to descending
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
            <Button
              variant="contained"
              startIcon={<CompareIcon />}
              onClick={onCompareSelected}
              color="primary"
              size="small"
            >
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
          <Typography variant="body2" fontWeight={600} color="primary">
            {selectedAnalysisIds.size} selected
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {selectedAnalysisIds.size > 1 && (
            <Button
              variant="outlined"
              startIcon={<CompareIcon />}
              onClick={onCompareSelected}
              size="small"
              sx={{ borderRadius: 2 }}
            >
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
                    indeterminate={
                      selectedAnalysisIds.size > 0 && selectedAnalysisIds.size < sortedAnalyses.length
                    }
                    checked={sortedAnalyses.length > 0 && selectedAnalysisIds.size === sortedAnalyses.length}
                    onChange={() => {
                      if (selectedAnalysisIds.size === sortedAnalyses.length) {
                        // Deselect all
                        onSelectAll?.([]);
                      } else {
                        // Select all
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
                sortedAnalyses.map((analysis) => {
                  const isSelected = selectedAnalysisIds.has(analysis._id);
                  return (
                    <TableRow
                      key={analysis._id}
                      hover
                      selected={isSelected}
                      component={Link}
                      to={`/datasets/${analysis._id}`}
                      sx={{
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        '&.Mui-selected': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.12),
                          }
                        },
                        textDecoration: 'none',
                        color: 'inherit'
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            onSelectAnalysis(analysis._id);
                          }}
                        />
                      </TableCell>
                      <TableCell>{analysis.dataset}</TableCell>
                      <TableCell>{analysis.size || '-'}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(analysis.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(analysis.updatedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          {analysis.downloadUrl && (
                            <Tooltip title="Download dataset">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDownload(analysis);
                                }}
                                disabled={downloadLoading === analysis._id}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': { color: 'success.main', bgcolor: alpha(theme.palette.success.main, 0.1) }
                                }}
                              >
                                {downloadLoading === analysis._id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <DownloadIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEditDatasets() && (
                            <Tooltip title="Edit dataset name">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleEditClick(analysis);
                                }}
                                disabled={editLoading}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.1) }
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDeleteDatasets() && (
                            <Tooltip title="Delete analysis">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteClick(analysis);
                                }}
                                disabled={deleteLoading}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={handleCancelDelete}>
        <DialogTitle>Delete Analysis</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this analysis?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? <CircularProgress size={24} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dataset Name Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Dataset Name</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Dataset Name"
            fullWidth
            variant="outlined"
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            disabled={editLoading}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Size (optional)"
            fullWidth
            variant="outlined"
            value={newDatasetSize}
            onChange={(e) => setNewDatasetSize(e.target.value)}
            disabled={editLoading}
            placeholder="e.g., 1.2 GB, 500 MB, 2.5 TB"
            helperText="Human-readable size description"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Download URL (optional)"
            fullWidth
            variant="outlined"
            value={newDownloadUrl}
            onChange={(e) => setNewDownloadUrl(e.target.value)}
            disabled={editLoading}
            placeholder="https://example.com/dataset.zip or datasets/xod_dataset.zip"
            helperText="Direct download link or MinIO bucket path (e.g., datasets/xod_dataset.zip)"
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditCancel} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleEditConfirm}
            variant="contained"
            disabled={editLoading || !newDatasetName.trim()}
          >
            {editLoading ? <CircularProgress size={24} /> : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AnalysisTable;
