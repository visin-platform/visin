import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
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
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Chip,
  FormControlLabel,
  Switch,
  Card,
  CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as ContentCopyIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiTokenService, ApiToken } from '../services/apiTokenService';
import { projectService } from '../services/projectService';
import { Project, UpdateProjectData } from '../types/Project';
import { formatDateTime } from '../utils';

interface ProjectSettingsProps {
  project: Project;
}

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project }) => {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [createdToken, setCreatedToken] = useState<ApiToken | null>(null);

  // Project editing state
  const [editName, setEditName] = useState(project.name);
  const [editSlug, setEditSlug] = useState(project.slug || '');
  const [editDescription, setEditDescription] = useState(project.description || '');
  const [editIsPublic, setEditIsPublic] = useState(project.isPublic);
  const [projectUpdateError, setProjectUpdateError] = useState<string | null>(null);

  const { data: tokensResponse } = useQuery({
    queryKey: ['api-tokens', project._id],
    queryFn: () => apiTokenService.getTokens(project._id)
  });

  const createMutation = useMutation({
    mutationFn: apiTokenService.createToken,
    onSuccess: (response) => {
      setCreatedToken(response.data);
      queryClient.invalidateQueries({ queryKey: ['api-tokens', project._id] });
      setNewTokenName('');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: apiTokenService.revokeToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens', project._id] });
    }
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectData }) => projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project._id] });
      setProjectUpdateError(null);
    },
    onError: (error: any) => {
      setProjectUpdateError(error.response?.data?.message || 'Failed to update project');
    }
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: newTokenName,
      projectId: project._id,
      expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined
    });
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setCreatedToken(null);
    setNewTokenName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Form is always editable now — edit fields are initialized with project values

  const handleSaveProject = () => {
    const updateData: UpdateProjectData = {
      name: editName,
      description: editDescription,
      isPublic: editIsPublic
    };

    if (editSlug.trim()) {
      updateData.slug = editSlug.trim();
    }

    updateProjectMutation.mutate({
      id: project._id,
      data: updateData
    });
  };

  return (
    <Box>
      {/* Project Settings */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">Project Settings</Typography>
            <Box>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveProject}
                disabled={updateProjectMutation.isPending}
              >
                Save
              </Button>
            </Box>
          </Box>

          {projectUpdateError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {projectUpdateError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label="Project Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />

            <TextField
              fullWidth
              label="Project Slug (Optional)"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              helperText="Used in URLs for human-readable links. Leave it empty to use project ID."
            />

            <TextField
              fullWidth
              label="Description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline
              rows={3}
            />

            <FormControlLabel
              control={<Switch checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} />}
              label="Public project"
            />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Public URL:
              </Typography>
              <Link
                to={`/projects/${editSlug || project.slug || project._id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'underline',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  {window.location.origin}/projects/{editSlug || project.slug || project._id}
                </Typography>
              </Link>
              <Tooltip title="Copy URL">
                <IconButton
                  size="small"
                  onClick={() => copyToClipboard(`${window.location.origin}/projects/${editSlug || project.slug || project._id}`)}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>
      {/* API Tokens Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">API Tokens</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Generate New Token
        </Button>
      </Box>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 3
        }}>
        API tokens allow you to authenticate requests to the Vision API programmatically. 
        Use these tokens to submit trainings or track usage from your scripts.
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Prefix</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokensResponse?.data?.map((token: ApiToken) => (
              <TableRow key={token._id}>
                <TableCell>{token.name}</TableCell>
                <TableCell>
                  <Chip label={token.prefix + '...'} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                </TableCell>
                <TableCell>{formatDateTime(token.createdAt)}</TableCell>
                <TableCell>
                  {token.expiresAt ? formatDateTime(token.expiresAt) : 'Never'}
                </TableCell>
                <TableCell>
                  {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : 'Never'}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={token.isActive ? 'Active' : 'Revoked'} 
                    color={token.isActive ? 'success' : 'default'} 
                    size="small" 
                  />
                </TableCell>
                <TableCell align="right">
                  {token.isActive && (
                    <Tooltip title="Revoke Token">
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to revoke this token?')) {
                            revokeMutation.mutate(token._id);
                          }
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {( !tokensResponse?.data || tokensResponse?.data?.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography sx={{
                    color: "text.secondary"
                  }}>No API tokens found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={createDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Generate API Token</DialogTitle>
        <DialogContent>
          {!createdToken ? (
            <Box sx={{ pt: 1 }}>
              <TextField
                autoFocus
                margin="dense"
                label="Token Name"
                fullWidth
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g. CI/CD Pipeline, Local Training Script"
              />
              <TextField
                margin="dense"
                label="Expiration (Days)"
                type="number"
                fullWidth
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                helperText="Leave empty for no expiration"
              />
            </Box>
          ) : (
            <Box sx={{ pt: 2 }}>
              <Alert severity="success" sx={{ mb: 2 }}>
                Token generated successfully! Copy it now, you won't be able to see it again.
              </Alert>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  bgcolor: 'grey.50', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {createdToken?.token}
                </Typography>
                <IconButton onClick={() => copyToClipboard(createdToken?.token || '')}>
                  <ContentCopyIcon />
                </IconButton>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!createdToken ? (
            <>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button 
                onClick={handleCreate} 
                variant="contained"
                disabled={!newTokenName || createMutation.isPending}
              >
                Generate
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseDialog} variant="contained">
              Done
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectSettings;
