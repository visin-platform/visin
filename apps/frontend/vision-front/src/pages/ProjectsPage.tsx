import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  alpha,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteOutlineIcon,
  Public as PublicIcon,
  Lock as LockIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '../services/projectService';
import { Project } from '../types/Project';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  usePageTitle('Projects - Vision');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectService.getProjects()
  });

  const projects = data?.data || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setCreateError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);

      if (editingProjectId) {
        await projectService.updateProject(editingProjectId, {
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          isPublic
        });
        setCreateSuccess('Project updated successfully!');
      } else {
        await projectService.createProject({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          isPublic
        });
        setCreateSuccess(`Project "${projectName}" created successfully!`);
      }

      setCreateModalOpen(false);
      setEditingProjectId(null);
      setProjectName('');
      setProjectDescription('');
      setIsPublic(false);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setCreating(false);
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProjectId(project._id);
    setProjectName(project.name);
    setProjectDescription(project.description || '');
    setIsPublic(project.isPublic);
    setCreateModalOpen(true);
  };

  const handleDeleteClick = (projectId: string) => {
    setDeleteProjectId(projectId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteProjectId) return;

    try {
      setCreating(true);
      await projectService.deleteProject(deleteProjectId);
      setCreateSuccess('Project deleted successfully!');
      setDeleteDialogOpen(false);
      setDeleteProjectId(null);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseModal = () => {
    if (!creating) {
      setCreateModalOpen(false);
      setProjectName('');
      setProjectDescription('');
      setIsPublic(false);
      setCreateError(null);
      setCreateSuccess(null);
      setEditingProjectId(null);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', current: true }
        ]}
      />

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Projects
          </Typography>
          <Typography 
            variant="body1" 
            color="text.secondary"
            sx={{ display: { xs: 'none', sm: 'block' } }}
          >
            Manage your research projects
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {user && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setProjectName('');
                setProjectDescription('');
                setIsPublic(false);
                setCreateError(null);
                setCreateSuccess(null);
                setEditingProjectId(null);
                setCreateModalOpen(true);
              }}
              sx={{ 
                px: { xs: 2, sm: 3 },
                py: { xs: 0.75, sm: 1 },
                fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                borderRadius: 2,
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
              }}
            >
              <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>New Project</Box>
              <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>New</Box>
            </Button>
          )}
          <IconButton 
            onClick={() => refetch()} 
            disabled={isLoading}
            sx={{ 
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              '&:hover': { bgcolor: theme.palette.action.hover }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load projects'}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: theme.shadows[2] }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Visibility</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.length === 0 && !isLoading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ pb: 4 }}>
                  <Typography color="text.secondary">No projects found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project: Project) => (
                <TableRow key={project._id} hover>
                  <TableCell>
                    <Typography 
                      fontWeight={600}
                      sx={{ 
                        cursor: 'pointer', 
                        color: 'primary.main',
                        '&:hover': { textDecoration: 'underline' }
                      }}
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      {project.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {project.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={project.isPublic ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                      label={project.isPublic ? 'Public' : 'Private'}
                      size="small"
                      color={project.isPublic ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {formatDateTime(project.createdAt)}
                  </TableCell>
                  <TableCell align="right">
                    {user && project.ownerId === user.id && (
                      <>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEditProject(project)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDeleteClick(project._id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ProjectFormDialog
        open={createModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCreateProject}
        isEditing={!!editingProjectId}
        isCreating={creating}
        name={projectName}
        onNameChange={setProjectName}
        description={projectDescription}
        onDescriptionChange={setProjectDescription}
        isPublic={isPublic}
        onIsPublicChange={setIsPublic}
        error={createError}
        success={createSuccess}
      />

      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this project? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button 
            onClick={() => setDeleteDialogOpen(false)} 
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            {creating ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ProjectsPage;
