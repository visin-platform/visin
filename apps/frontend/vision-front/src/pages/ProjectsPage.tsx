import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  Tabs,
  Tab
} from '@mui/material';
import {
  Scoreboard as LeaderboardIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  DeleteOutlined as DeleteOutlineIcon,
  Public as PublicIcon,
  Lock as LockIcon,
  Folder as FolderIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import {
  OwnerChip,
  type OwnerRef,
  EmptyState,
  ListRow,
  PageHeader,
  Panel,
  RowIcon,
  useCompactLayout,
  livePalette
} from '@visin/frontend-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectService } from '../services/projectService';
import { Project } from '../types/Project';
import { useProjectGroups } from '../hooks/useProjectGroups';
import ProjectTrash from '../components/project/ProjectTrash';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { ProjectCosting, ProjectTaxonomy } from '../types/taxonomy';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, formatDateTime } from '../utils';

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const groups = useProjectGroups();
  const [owner, setOwner] = useState<OwnerRef>({ kind: 'user', id: user?.id ?? '' });
  const [showTrash, setShowTrash] = useState(false);
  const compact = useCompactLayout();
  usePageTitle('Projects - Vision');
  // The phone list's per-row actions menu, and the project it is open for.
  const [menu, setMenu] = useState<{ anchor: HTMLElement; project: Project } | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  // Optional display settings; an empty object means "discover everything".
  const [taxonomy, setTaxonomy] = useState<ProjectTaxonomy>({});
  // Blank means this project shows no costs; there is no default rate.
  const [costing, setCosting] = useState<ProjectCosting>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  // `?new=1`, from the home page's "Get started": open the form at once, and go
  // to the project once it exists, where its first-run guide is.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openedFromGuide, setOpenedFromGuide] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  // `?search=`, from the menu's search box: only projects matching it (name or description).
  const search = searchParams.get('search')?.trim() || undefined;

  // Sorting state
  const [sortBy, setSortBy] = useState<'name' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', user?.id, sortBy, sortOrder, search],
    queryFn: () => projectService.getProjects({ sortBy, sortOrder, search })
  });

  const projects = data?.data || [];

  // Edit/delete only ever render on a project the signed-in user owns, so for a
  // logged-out visitor — or one browsing only other people's public projects —
  // the column was a header over a row of blank cells.
  const showActions = projects.some((project: Project) => project.permissions.manage);

  const canShare = editingProjectId
    ? !!projects.find((project) => project._id === editingProjectId)?.permissions.own
    : owner.kind === 'user' || groups.data?.find((group) => group.id === owner.id)?.role === 'owner';

  const handleSort = (property: 'name' | 'createdAt') => {
    const isAsc = sortBy === property && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(property);
  };

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
          ...(projects.find((project) => project._id === editingProjectId)?.permissions.own
            ? { visibility: isPublic ? ('public' as const) : ('private' as const) }
            : {}),
          // null clears it, so an emptied form returns the project to discovery
          taxonomy: Object.keys(taxonomy).length > 0 ? taxonomy : null,
          costing: Object.keys(costing).length > 0 ? costing : null
        });
        setCreateSuccess('Project updated successfully!');
      } else {
        const created = await projectService.createProject({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          owner,
          visibility: isPublic && canShare ? 'public' : 'private',
          taxonomy: Object.keys(taxonomy).length > 0 ? taxonomy : undefined,
          costing: Object.keys(costing).length > 0 ? costing : undefined
        });
        if (openedFromGuide && created.data) {
          navigate(`/projects/${created.data._id}`);
          return;
        }
        setCreateSuccess(`Project "${projectName}" created successfully!`);
      }

      setCreateModalOpen(false);
      setEditingProjectId(null);
      setProjectName('');
      setProjectDescription('');
      setIsPublic(false);
      setTaxonomy({});
      setCosting({});
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
    setIsPublic(project.visibility === 'public');
    setTaxonomy(project.taxonomy ?? {});
    setCosting(project.costing ?? {});
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
      setCreateSuccess('Project moved to trash. Its owner can restore it for 30 days.');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
      setTaxonomy({});
      setCosting({});
      setCreateError(null);
      setCreateSuccess(null);
      setEditingProjectId(null);
    }
  };

  useEffect(() => {
    if (searchParams.get('new') !== '1' || !user) return;
    if (groups.isLoading) return;
    setOpenedFromGuide(true);
    openCreate();
    if (groups.data?.[0]) setOwner({ kind: 'group', id: groups.data[0].id });
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('new');
        return next;
      },
      { replace: true }
    );
    // openCreate only resets form state; running this once per ?new=1 is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, groups.isLoading, groups.data]);

  // `?create=1`, from the menu's New: the form, for the viewer as the owner. Unlike `?new=1`
  // it does not pick a group or send the new project's author to its guide.
  useEffect(() => {
    if (searchParams.get('create') !== '1' || !user) return;
    openCreate();
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('create');
        return next;
      },
      { replace: true }
    );
    // openCreate only resets form state; running this once per ?create=1 is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const openCreate = () => {
    setOwner({ kind: 'user', id: user?.id ?? '' });
    setProjectName('');
    setProjectDescription('');
    setIsPublic(false);
    setCreateError(null);
    setCreateSuccess(null);
    setEditingProjectId(null);
    setCreateModalOpen(true);
  };

  // Signed in, an empty list is a start: say what a project is for and offer the first one.
  const emptyState = user ? (
    <EmptyState
      icon={<FolderIcon />}
      title="No projects yet"
      description="A project holds the training runs of one line of work. Create one, then send it your first run."
      action={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New project
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<FolderIcon />}
      title="No projects found"
      description="A project holds the training runs of one line of work."
    />
  );

  const visibility = (project: Project) => (project.visibility === 'public' ? 'Public' : 'Private');

  const list = compact ? (
    <Panel aria-label="Projects">
      {projects.length === 0 && !isLoading
        ? emptyState
        : projects.map((project: Project) => (
            <ListRow
              key={project._id}
              to={`/projects/${project._id}`}
              leading={
                <RowIcon
                  color={
                    project.visibility === 'public' ? livePalette(theme).success.main : livePalette(theme).primary.main
                  }
                >
                  {project.visibility === 'public' ? <PublicIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
                </RowIcon>
              }
              title={
                <>
                  {project.name}{' '}
                  <OwnerChip
                    owner={project.owner}
                    userId={user?.id}
                    groups={groups.data ?? []}
                    ownerName={project.owner.name}
                  />
                </>
              }
              secondary={[visibility(project), formatDate(project.createdAt), project.description]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                project.permissions.manage ? (
                  <IconButton
                    aria-label={`Actions for ${project.name}`}
                    onClick={(event) => setMenu({ anchor: event.currentTarget, project })}
                  >
                    <MoreVertIcon />
                  </IconButton>
                ) : undefined
              }
            />
          ))}
    </Panel>
  ) : (
    <Panel>
      <TableContainer>
        <Table sx={{ '& .MuiTableCell-root': { px: 2 } }}>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'name'}
                  direction={sortBy === 'name' ? sortOrder : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Visibility</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'createdAt'}
                  direction={sortBy === 'createdAt' ? sortOrder : 'asc'}
                  onClick={() => handleSort('createdAt')}
                >
                  Created
                </TableSortLabel>
              </TableCell>
              {showActions && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.length === 0 && !isLoading ? (
              <TableRow>
                <TableCell colSpan={showActions ? 5 : 4} sx={{ border: 0 }}>
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project: Project) => (
                <TableRow key={project._id} hover sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <RowIcon
                        color={
                          project.visibility === 'public'
                            ? livePalette(theme).success.main
                            : livePalette(theme).primary.main
                        }
                      >
                        {project.visibility === 'public' ? (
                          <PublicIcon fontSize="small" />
                        ) : (
                          <FolderIcon fontSize="small" />
                        )}
                      </RowIcon>
                      <Typography
                        onClick={() => navigate(`/projects/${project._id}`)}
                        sx={{ fontWeight: 600, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                      >
                        {project.name}
                      </Typography>
                      <OwnerChip
                        owner={project.owner}
                        userId={user?.id}
                        groups={groups.data ?? []}
                        ownerName={project.owner.name}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        maxWidth: 380,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {project.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={
                        project.visibility === 'public' ? (
                          <PublicIcon fontSize="small" />
                        ) : (
                          <LockIcon fontSize="small" />
                        )
                      }
                      label={visibility(project)}
                      size="small"
                      color={project.visibility === 'public' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {formatDateTime(project.createdAt)}
                  </TableCell>
                  {showActions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {project.permissions.manage && (
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
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Panel>
  );

  return (
    <Box>
      <PageHeader
        title="Projects"
        subtitle="Research projects and the training runs inside them."
        hideTitleOnPhone
        actions={
          <Tooltip title="Refresh">
            <span>
              <IconButton aria-label="Refresh" onClick={() => refetch()} disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        }
        primaryAction={user ? { label: 'New project', icon: <AddIcon />, onClick: openCreate } : undefined}
      />
      <Button component={RouterLink} to="/leaderboards" variant="outlined" startIcon={<LeaderboardIcon />} sx={{ mb: 2 }}>Leaderboards</Button>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error instanceof Error ? error.message : 'Failed to load projects'}
        </Alert>
      )}
      {search && !showTrash && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                setSearchParams(
                  (params) => {
                    const next = new URLSearchParams(params);
                    next.delete('search');
                    return next;
                  },
                  { replace: true }
                )
              }
            >
              Clear
            </Button>
          }
        >
          Projects matching “{search}”
        </Alert>
      )}
      {user && (
        <Tabs value={showTrash ? 1 : 0} onChange={(_event, value) => setShowTrash(value === 1)} sx={{ mb: 2 }}>
          <Tab label="Projects" />
          <Tab label="Trash" />
        </Tabs>
      )}
      {createError && !createModalOpen && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {createError}
        </Alert>
      )}
      {createSuccess && !createModalOpen && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {createSuccess}
        </Alert>
      )}
      {showTrash && user ? <ProjectTrash userId={user.id} groups={groups.data ?? []} /> : list}
      <Menu
        anchorEl={menu?.anchor}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menu) handleEditProject(menu.project);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) handleDeleteClick(menu.project._id);
            setMenu(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
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
        owner={owner}
        onOwnerChange={(next) => {
          setOwner(next);
          setIsPublic(false);
        }}
        userId={user?.id ?? ''}
        groups={groups.data ?? []}
        groupsLoading={groups.isLoading}
        groupsError={groups.isError}
        canShare={canShare}
        isPublic={isPublic}
        onIsPublicChange={setIsPublic}
        taxonomy={taxonomy}
        onTaxonomyChange={setTaxonomy}
        costing={costing}
        onCostingChange={setCosting}
        error={createError}
        success={createSuccess}
      />
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Move this project and its trainings to the trash? Its owner can restore them for 30 days.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={creating} sx={{ borderRadius: 2 }}>
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
    </Box>
  );
};

export default ProjectsPage;
