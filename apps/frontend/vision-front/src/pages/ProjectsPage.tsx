import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Alert,
  IconButton,
  Tooltip,
  MenuItem,
  TextField,
  Tabs,
  Tab
} from '@mui/material';
import {
  Scoreboard as LeaderboardIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Folder as FolderIcon
} from '@mui/icons-material';
import {
  OwnerChip,
  type OwnerRef,
  EmptyState,
  ListRow,
  PageHeader,
  Panel,
  useCompactLayout
} from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '../services/projectService';
import { Project } from '../types/Project';
import { useProjectGroups } from '../hooks/useProjectGroups';
import ProjectTrash from '../components/project/ProjectTrash';
import ProjectThumb from '../components/project/ProjectThumb';
import ProjectCard from '../components/project/ProjectCard';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { ProjectCosting, ProjectTaxonomy } from '../types/taxonomy';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { formatRelativeTime, runsLabel } from '../utils';

type SortField = 'name' | 'createdAt' | 'lastActivityAt';
type SortKey = `${SortField}:${'asc' | 'desc'}`;
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'lastActivityAt:desc', label: 'Latest activity' },
  { key: 'createdAt:desc', label: 'Newest' },
  { key: 'name:asc', label: 'Name (A to Z)' }
];

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const groups = useProjectGroups();
  const [owner, setOwner] = useState<OwnerRef>({ kind: 'user', id: user?.id ?? '' });
  const [showTrash, setShowTrash] = useState(false);
  const compact = useCompactLayout();
  usePageTitle('Projects - Vision');

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
  // `?new=1`, from the home page's "Get started": open the form at once, and go
  // to the project once it exists, where its first-run guide is.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openedFromGuide, setOpenedFromGuide] = useState(false);
  // `?search=`, from the menu's search box: only projects matching it (name or description).
  const search = searchParams.get('search')?.trim() || undefined;

  // What moved most recently first: what someone coming back to their work wants to see.
  const [sort, setSort] = useState<SortKey>('lastActivityAt:desc');
  const [sortBy, sortOrder] = sort.split(':') as [SortField, 'asc' | 'desc'];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', user?.id, sortBy, sortOrder, search],
    queryFn: () => projectService.getProjects({ sortBy, sortOrder, search })
  });

  const projects = data?.data || [];

  // Editing, ownership and the trash live in the project's Settings, not in the list.
  const canShare = owner.kind === 'user' || groups.data?.find((group) => group.id === owner.id)?.role === 'owner';

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setCreateError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);

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

      setCreateModalOpen(false);
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
                <ProjectThumb project={project} />
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
              secondary={[
                visibility(project),
                runsLabel(project.runs),
                project.runningRuns ? `${project.runningRuns} running` : null,
                `active ${formatRelativeTime(project.lastActivityAt ?? project.updatedAt)}`,
                project.description
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
    </Panel>
  ) : projects.length === 0 && !isLoading ? (
    <Panel>{emptyState}</Panel>
  ) : (
    <Box
      component="section"
      aria-label="Projects"
      sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}
    >
      {projects.map((project: Project) => (
        <ProjectCard key={project._id} project={project} userId={user?.id} groups={groups.data ?? []} />
      ))}
    </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {user ? (
          <Tabs value={showTrash ? 1 : 0} onChange={(_event, value) => setShowTrash(value === 1)}>
            <Tab label="Projects" />
            <Tab label="Trash" />
          </Tabs>
        ) : (
          <span />
        )}
        {!showTrash && (
          <TextField
            select
            size="small"
            label="Sort by"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            sx={{ minWidth: 190 }}
          >
            {SORTS.map((option) => (
              <MenuItem key={option.key} value={option.key}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
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
      <ProjectFormDialog
        open={createModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCreateProject}
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
    </Box>
  );
};

export default ProjectsPage;
