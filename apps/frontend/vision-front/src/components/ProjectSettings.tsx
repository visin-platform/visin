import { visionApi } from '../config/visionApi';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText
} from '@mui/material';
import { ContentCopy as ContentCopyIcon, Save as SaveIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  OwnerChip,
  TransferOwnershipDialog,
  VisibilitySwitch,
  useCompactLayout,
  type OwnerGroup,
  type OwnerRef
} from '@visin/frontend-core';
import { projectService } from '../services/projectService';
import { Project, ProjectStorage, UpdateProjectData } from '../types/Project';
import { useAuth } from '../contexts/AuthContext';
import TaxonomyEditor from './taxonomy/TaxonomyEditor';
import PipelineKeys from './project/PipelineKeys';
import CostingEditor from './taxonomy/CostingEditor';
import StorageEditor from './project/StorageEditor';
import ProjectCoverPicker from './project/ProjectCoverPicker';
import { ProjectCosting, ProjectTaxonomy } from '../types/taxonomy';

interface ProjectSettingsProps {
  project: Project;
  /**
   * Conditions and classes seen in this project's results, offered as a
   * one-click starting point. Optional: the editor is useful without it, and
   * anything left unconfigured is discovered at render time anyway.
   */
  discovered?: { conditions?: string[]; classes?: string[] };
}

/** Where the rail's entries lead; an id is the card's, so a link and its card cannot drift apart. */
const SECTIONS = [
  { id: 'settings-details', label: 'Details' },
  { id: 'settings-cover', label: 'Cover' },
  { id: 'settings-access', label: 'Access and keys' },
  { id: 'settings-labels', label: 'Result labels' },
  { id: 'settings-monitoring', label: 'Run monitoring' },
  { id: 'settings-costs', label: 'Compute costs' },
  { id: 'settings-storage', label: 'Storage' },
  { id: 'settings-ownership', label: 'Ownership' }
] as const;

/** Clear of the app bar that sticks to the top of the page, so a section's heading is not hidden by it. */
const SECTION_OFFSET = 80;

const sectionSx = { mb: 3, scrollMarginTop: `${SECTION_OFFSET}px` } as const;

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project, discovered }) => {
  const queryClient = useQueryClient();
  const compact = useCompactLayout();
  const { user } = useAuth();
  const [transferOpen, setTransferOpen] = useState(false);

  // Project editing state
  const [editName, setEditName] = useState(project.name);
  const [editSlug, setEditSlug] = useState(project.slug || '');
  const [editDescription, setEditDescription] = useState(project.description || '');
  const [editorGroupIds, setEditorGroupIds] = useState<string[]>(project.editorGroupIds || []);
  const { data: groups = [], isError: groupsFailed } = useQuery({
    queryKey: ['project-groups', user?.id],
    queryFn: async () => {
      const response = await visionApi.get('/write-capabilities/groups');
      return (response.data as { data: OwnerGroup[] }).data;
    }
  });
  const groupOptions = [...new Set([...groups.map((group) => group.id), ...editorGroupIds])];
  const [editIsPublic, setEditIsPublic] = useState(project.visibility === 'public');
  const [editTaxonomy, setEditTaxonomy] = useState<ProjectTaxonomy>(project.taxonomy ?? {});
  const [stallAfterMinutes, setStallAfterMinutes] = useState(project.stallAfterMinutes ?? 30);
  const [editCosting, setEditCosting] = useState<ProjectCosting>(project.costing ?? {});
  const [editStorage, setEditStorage] = useState<ProjectStorage>(project.storage ?? { provider: 'visin' });
  const [projectUpdateError, setProjectUpdateError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // "Saved" is news for a moment, not a state the page stays in.
  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectData }) => projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['write-capabilities'] });
      setProjectUpdateError(null);
      setSaved(true);
    },
    onError: (error: ApiError | Error) => {
      setProjectUpdateError(error.message || 'Failed to update project');
    }
  });

  const transferMutation = useMutation({
    mutationFn: (owner: OwnerRef) => projectService.transferProject(project._id, owner),
    onSuccess: () => {
      setTransferOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['write-capabilities'] });
    }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Form is always editable now — edit fields are initialized with project values

  const handleSaveProject = () => {
    const updateData: UpdateProjectData = {
      name: editName,
      stallAfterMinutes,
      description: editDescription,
      ...(project.permissions.own ? { visibility: editIsPublic ? ('public' as const) : ('private' as const) } : {}),
      editorGroupIds,
      // null clears it: an emptied form puts the project back on pure discovery
      taxonomy: Object.keys(editTaxonomy).length > 0 ? editTaxonomy : null,
      costing: Object.keys(editCosting).length > 0 ? editCosting : null,
      // Only when changed: an untouched project keeps no setting, which reads as Visin.
      ...(editStorage.provider !== (project.storage?.provider ?? 'visin') ||
      JSON.stringify(editStorage.settings ?? {}) !== JSON.stringify(project.storage?.settings ?? {})
        ? { storage: editStorage }
        : {})
    };

    if (editSlug.trim()) {
      updateData.slug = editSlug.trim();
    }

    updateProjectMutation.mutate({
      id: project._id,
      data: updateData
    });
  };

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  const sections = SECTIONS.filter((section) => section.id !== 'settings-ownership' || project.permissions.own);

  // One Save for the whole page: in the rail beside the sections while it can
  // stick there, and at the end of the form on a phone, where the rail is a row.
  // The outcome sits with the button, where the person who pressed it is looking: the top of a long page is
  // off-screen when the Save in the rail is used.
  const saveButton = (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Button
        variant="contained"
        startIcon={<SaveIcon />}
        onClick={() => {
          setSaved(false);
          handleSaveProject();
        }}
        disabled={updateProjectMutation.isPending}
        fullWidth
      >
        {updateProjectMutation.isPending ? 'Saving…' : 'Save'}
      </Button>
      {projectUpdateError && <Alert severity="error">{projectUpdateError}</Alert>}
      <Typography role="status" variant="body2" sx={{ color: 'success.main', textAlign: 'center', minHeight: '1.5em' }}>
        {saved ? 'Saved' : ''}
      </Typography>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '200px minmax(0, 1fr)' },
        gap: { xs: 2, md: 4 },
        alignItems: 'start'
      }}
    >
      <Box
        sx={{
          position: { md: 'sticky' },
          top: { md: SECTION_OFFSET },
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}
      >
        <List
          component="nav"
          aria-label="Settings sections"
          dense
          disablePadding
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            overflowX: { xs: 'auto', md: 'visible' },
            gap: 0.5
          }}
        >
          {sections.map((section) => (
            <ListItemButton
              key={section.id}
              onClick={() => goTo(section.id)}
              sx={{ borderRadius: 1, flexShrink: 0, width: { xs: 'auto', md: '100%' } }}
            >
              <ListItemText primary={section.label} slotProps={{ primary: { noWrap: true } }} />
            </ListItemButton>
          ))}
        </List>
        {!compact && saveButton}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {/* Project Settings */}
        <Card id="settings-details" component="section" aria-labelledby="settings-details-title" sx={sectionSx}>
          <CardContent>
            <Typography id="settings-details-title" variant="h6" sx={{ mb: 3 }}>
              Details
            </Typography>

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

              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary'
                  }}
                >
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
                      overflowWrap: 'anywhere',
                      '&:hover': { textDecoration: 'underline' }
                    }}
                  >
                    {window.location.origin}/projects/{editSlug || project.slug || project._id}
                  </Typography>
                </Link>
                <Tooltip title="Copy URL">
                  <IconButton
                    size="small"
                    onClick={() =>
                      copyToClipboard(`${window.location.origin}/projects/${editSlug || project.slug || project._id}`)
                    }
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card id="settings-cover" component="section" aria-labelledby="settings-cover-title" sx={sectionSx}>
          <CardContent>
            <Typography id="settings-cover-title" variant="h6" sx={{ mb: 1 }}>
              Cover
            </Typography>
            <ProjectCoverPicker project={project} />
          </CardContent>
        </Card>
        <Card id="settings-access" component="section" aria-labelledby="settings-access-title" sx={sectionSx}>
          <CardContent>
            <Typography id="settings-access-title" variant="h6" sx={{ mb: 3 }}>
              Access and keys
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Autocomplete
                multiple
                options={groupOptions}
                value={editorGroupIds}
                onChange={(_event, ids) => setEditorGroupIds(ids)}
                getOptionLabel={(id) => groups.find((group) => group.id === id)?.name || id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Editor groups"
                    helperText="Members can read this project, add trainings and results, and edit or delete their own contributions."
                  />
                )}
              />
              {groupsFailed && <Alert severity="error">Could not load your groups. Retry before adding a group.</Alert>}

              <VisibilitySwitch
                value={editIsPublic ? 'public' : 'private'}
                onChange={(value) => setEditIsPublic(value === 'public')}
                canMakePublic={project.permissions.own}
                disabled={!project.permissions.own || updateProjectMutation.isPending}
              />
              <Typography variant="body2" color="text.secondary">
                Trainings, results and configs follow this project's visibility.
              </Typography>
            </Box>
          </CardContent>
        </Card>
        {project.permissions.contribute && <PipelineKeys projectId={project._id} />}
        {/* Result vocabulary */}
        <Card id="settings-labels" component="section" aria-labelledby="settings-labels-title" sx={sectionSx}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography id="settings-labels-title" variant="h6">
                Result labels
              </Typography>
              <Button
                size="small"
                onClick={() => setEditTaxonomy({})}
                disabled={updateProjectMutation.isPending || Object.keys(editTaxonomy).length === 0}
              >
                Reset to discovered
              </Button>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              How this project's conditions, classes and metrics are named and ordered. Purely cosmetic — your training
              pipeline can report anything it likes and it will still show up.
            </Typography>
            <TaxonomyEditor
              value={editTaxonomy}
              onChange={setEditTaxonomy}
              disabled={updateProjectMutation.isPending}
              discovered={discovered}
            />
          </CardContent>
        </Card>
        <Card id="settings-monitoring" component="section" aria-labelledby="settings-monitoring-title" sx={sectionSx}>
          <CardContent>
            <Typography id="settings-monitoring-title" variant="h6" sx={{ mb: 2 }}>
              Run monitoring
            </Typography>
            <TextField
              label="Mark runs stalled after (minutes)"
              type="number"
              value={stallAfterMinutes}
              onChange={(event) => setStallAfterMinutes(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 10080 } }}
              helperText="A silent running job is marked stalled after this interval."
              sx={{ mb: 2 }}
            />
          </CardContent>
        </Card>
        {/* Compute costs */}
        <Card id="settings-costs" component="section" aria-labelledby="settings-costs-title" sx={sectionSx}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography id="settings-costs-title" variant="h6">
                Compute costs
              </Typography>
              <Button
                size="small"
                onClick={() => setEditCosting({})}
                disabled={updateProjectMutation.isPending || Object.keys(editCosting).length === 0}
              >
                Clear rates
              </Button>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              What an hour on this project's hardware costs.
            </Typography>
            <CostingEditor value={editCosting} onChange={setEditCosting} disabled={updateProjectMutation.isPending} />
          </CardContent>
        </Card>
        {/* Where big files live */}
        <Card id="settings-storage" component="section" aria-labelledby="settings-storage-title" sx={sectionSx}>
          <CardContent>
            <Typography id="settings-storage-title" variant="h6" sx={{ mb: 1 }}>
              Storage
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Where this project keeps its models and other large files.
            </Typography>
            <StorageEditor value={editStorage} onChange={setEditStorage} disabled={updateProjectMutation.isPending} />
          </CardContent>
        </Card>
        {project.permissions.own && (
          <Card id="settings-ownership" component="section" aria-labelledby="settings-ownership-title" sx={sectionSx}>
            <CardContent>
              <Typography id="settings-ownership-title" variant="h6" sx={{ mb: 3 }}>
                Ownership
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <OwnerChip owner={project.owner} userId={user?.id} groups={groups} ownerName={project.owner.name} />
                {project.permissions.own && (
                  <Button
                    onClick={() => {
                      transferMutation.reset();
                      setTransferOpen(true);
                    }}
                  >
                    Transfer ownership
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        )}
        {compact && saveButton}
      </Box>
      {user && (
        <TransferOwnershipDialog
          open={transferOpen}
          resourceName={project.name}
          current={project.owner}
          userId={user.id}
          groups={groups}
          busy={transferMutation.isPending}
          error={transferMutation.error?.message}
          onClose={() => setTransferOpen(false)}
          onTransfer={(owner) => transferMutation.mutate(owner)}
        />
      )}
    </Box>
  );
};

export default ProjectSettings;
