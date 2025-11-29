import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  Checkbox,
  TextField,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  CloudUpload as CloudUploadIcon,
  DeleteOutline as DeleteOutlineIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { configService } from '../services/configService';
import { Config } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

const ConfigsPage = () => {
  // Set page title
  usePageTitle('Configurations - Vision');
  // State
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedConfigIds, setSelectedConfigIds] = useState<Set<string>>(new Set());
  const [deleteMultipleDialogOpen, setDeleteMultipleDialogOpen] = useState(false);

  // Dialog states
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<Config | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Config | null>(null);
  const [editConfigName, setEditConfigName] = useState('');

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all configs on mount
  useEffect(() => {
    loadConfigs();
  }, []);

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Load configs
  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await configService.getAllConfigs();
      setConfigs(response.data.configs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs');
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection and upload
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      setError('No files selected');
      return;
    }

    const fileArray = Array.from(files);
    const errors: string[] = [];
    let successCount = 0;

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      for (const file of fileArray) {
        try {
          const fileContent = await file.text();
          const configData = JSON.parse(fileContent);

          // Extract summary from config (usually the "Summary" field)
          const summary = configData.Summary || configData.summary || 'Config';
          const configName = file.name.replace('.json', '');

          // Upload config
          await configService.uploadConfig({
            config_data: configData,
            Summary: summary,
            config_name: configName
          });

          successCount++;
        } catch (fileErr) {
          errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : 'Upload failed'}`);
        }
      }

      if (successCount > 0) {
        setSuccess(`Upload finished - ${successCount} config(s) processed`);
        await loadConfigs();
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload configs');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle view details
  const handleViewDetails = (config: Config) => {
    setSelectedConfig(config);
    setDetailsDialogOpen(true);
  };

  // Handle edit click
  const handleEditClick = (config: Config) => {
    setEditingConfig(config);
    setEditConfigName(config.config_name || '');
    setEditDialogOpen(true);
  };

  // Handle edit save
  const handleEditSave = async () => {
    if (!editingConfig) return;

    try {
      setLoading(true);
      setError(null);
      await configService.updateConfig(editingConfig._id, {
        config_name: editConfigName.trim() || undefined
      });
      setSuccess('Config name updated successfully!');
      setEditDialogOpen(false);
      setEditingConfig(null);
      setEditConfigName('');
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config name');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete click
  const handleDeleteClick = (configId: string) => {
    setDeleteConfigId(configId);
    setDeleteDialogOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteConfigId) return;

    try {
      setLoading(true);
      await configService.deleteConfig(deleteConfigId);
      setSuccess('Config deleted successfully!');
      setDeleteDialogOpen(false);
      setDeleteConfigId(null);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete config');
    } finally {
      setLoading(false);
    }
  };

  // Handle checkbox change
  const handleSelectConfig = (configId: string) => {
    const newSelected = new Set(selectedConfigIds);
    if (newSelected.has(configId)) {
      newSelected.delete(configId);
    } else {
      newSelected.add(configId);
    }
    setSelectedConfigIds(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedConfigIds.size === configs.length) {
      setSelectedConfigIds(new Set());
    } else {
      setSelectedConfigIds(new Set(configs.map(c => c._id)));
    }
  };

  // Handle delete selected
  const handleDeleteSelected = async () => {
    try {
      setLoading(true);
      const configsToDelete = Array.from(selectedConfigIds);
      
      for (const configId of configsToDelete) {
        await configService.deleteConfig(configId);
      }
      
      setSuccess(`${configsToDelete.length} config(s) deleted successfully!`);
      setDeleteMultipleDialogOpen(false);
      setSelectedConfigIds(new Set());
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete configs');
    } finally {
      setLoading(false);
    }
  };

  // Format config data for display
  const formatConfigData = (data: any, depth: number = 0): React.ReactNode => {
    if (depth > 3) return null; // Limit nesting depth for display
    
    if (typeof data !== 'object' || data === null) {
      return String(data);
    }

    if (Array.isArray(data)) {
      return `[${data.join(', ')}]`;
    }

    return (
      <Box sx={{ pl: 2 }}>
        {Object.entries(data).map(([key, value]) => (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
              {key}:
            </Typography>{' '}
            <Typography variant="body2" component="span">
              {typeof value === 'object' && value !== null
                ? formatConfigData(value, depth + 1)
                : String(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Configs Library
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Configs'}
          </Button>
          <IconButton onClick={() => loadConfigs()} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Manage training configurations. Configs are independent and can be selected when creating trainings.
      </Typography>

      {/* File Input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Configs Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {selectedConfigIds.size > 0 && (
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {selectedConfigIds.size} config(s) selected
              </Typography>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => setDeleteMultipleDialogOpen(true)}
              >
                Delete Selected
              </Button>
            </Box>
          )}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ fontWeight: 'bold' }}>
                    <Checkbox
                      indeterminate={
                        selectedConfigIds.size > 0 && selectedConfigIds.size < configs.length
                      }
                      checked={configs.length > 0 && selectedConfigIds.size === configs.length}
                      onChange={handleSelectAll}
                      disabled={configs.length === 0}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Config Name</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {configs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3 }}>
                      No configs uploaded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  configs.map((config) => (
                    <TableRow
                      key={config._id}
                      hover
                      selected={selectedConfigIds.has(config._id)}
                      sx={{
                        backgroundColor: selectedConfigIds.has(config._id)
                          ? 'rgba(25, 118, 210, 0.08)'
                          : 'inherit'
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedConfigIds.has(config._id)}
                          onChange={() => handleSelectConfig(config._id)}
                        />
                      </TableCell>
                      <TableCell>{config.config_name || 'Unnamed'}</TableCell>
                      <TableCell>
                        <Chip label={config.summary} variant="outlined" size="small" />
                      </TableCell>
                      <TableCell>
                        {formatDate(config.createdAt)}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Tooltip title="View config details">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(config);
                            }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit config name">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(config);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete config">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(config._id);
                            }}
                            disabled={loading}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Config Details</DialogTitle>
        <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {selectedConfig && (
            <Box sx={{ py: 2 }}>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Config UUID:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: 'monospace', mb: 2 }}
                >
                  {selectedConfig.config_uuid}
                </Typography>

                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Summary:
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {selectedConfig.summary}
                </Typography>

                {selectedConfig.config_name && (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Config Name:
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      {selectedConfig.config_name}
                    </Typography>
                  </>
                )}

                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Config Data:
                </Typography>
              </Box>
              <Paper sx={{ p: 2, backgroundColor: '#f9f9f9', overflow: 'auto' }}>
                {formatConfigData(selectedConfig.config_data)}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Config Name Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit Config</DialogTitle>
        <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {editingConfig && (
            <Box sx={{ py: 2 }}>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Config Name:
                </Typography>
                <TextField
                  autoFocus
                  margin="dense"
                  label="Config Name"
                  fullWidth
                  variant="outlined"
                  value={editConfigName}
                  onChange={(e) => setEditConfigName(e.target.value)}
                  placeholder="Enter config name..."
                  disabled={loading}
                />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Config UUID:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: 'monospace', mb: 2 }}
                >
                  {editingConfig.config_uuid}
                </Typography>

                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Summary:
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {editingConfig.summary}
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config Data:
              </Typography>
              <Paper sx={{ p: 2, backgroundColor: '#f9f9f9', overflow: 'auto', maxHeight: '300px' }}>
                {formatConfigData(editingConfig.config_data)}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleEditSave}
            variant="contained"
            disabled={loading || !editConfigName.trim()}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Config</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this config? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Multiple Confirmation Dialog */}
      <Dialog
        open={deleteMultipleDialogOpen}
        onClose={() => setDeleteMultipleDialogOpen(false)}
      >
        <DialogTitle>Delete Selected Configs</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedConfigIds.size} config(s)? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMultipleDialogOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSelected}
            color="error"
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ConfigsPage;
