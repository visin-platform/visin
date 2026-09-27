import { visionApi } from '../config/visionApi';
import React, { useState } from 'react';
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
  CardContent
} from '@mui/material';
import { ContentCopy as ContentCopyIcon, Save as SaveIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  OwnerChip,
  TransferOwnershipDialog,
  VisibilitySwitch,
  type OwnerGroup,
  type OwnerRef
} from '@visin/frontend-core';
import { projectService } from '../services/projectService';
import { Project, UpdateProjectData } from '../types/Project';
import { useAuth } from '../contexts/AuthContext';
import TaxonomyEditor from './taxonomy/TaxonomyEditor';
import PipelineKeys from './project/PipelineKeys';
import CostingEditor from './taxonomy/CostingEditor';
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

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project, discovered }) => {
  const queryClient = useQueryClient();
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
  const [editCosting, setEditCosting] = useState<ProjectCosting>(project.costing ?? {});
  const [projectUpdateError, setProjectUpdateError] = useState<string | null>(null);

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectData }) => projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['write-capabilities'] });
      setProjectUpdateError(null);
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
      description: editDescription,
      ...(project.permissions.own ? { visibility: editIsPublic ? ('public' as const) : ('private' as const) } : {}),
      editorGroupIds,
      // null clears it: an emptied form puts the project back on pure discovery
      taxonomy: Object.keys(editTaxonomy).length > 0 ? editTaxonomy : null,
      costing: Object.keys(editCosting).length > 0 ? editCosting : null
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
            <VisibilitySwitch
              value={editIsPublic ? 'public' : 'private'}
              onChange={(value) => setEditIsPublic(value === 'public')}
              canMakePublic={project.permissions.own}
              disabled={!project.permissions.own || updateProjectMutation.isPending}
            />
            <Typography variant="body2" color="text.secondary">
              Trainings, results and configs follow this project's visibility.
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
      {/* Result vocabulary */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Result Labels</Typography>
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
            pipeline can report anything it likes and it will still show up. Save with the button at the top of the
            page.
          </Typography>
          <TaxonomyEditor
            value={editTaxonomy}
            onChange={setEditTaxonomy}
            disabled={updateProjectMutation.isPending}
            discovered={discovered}
          />
        </CardContent>
      </Card>
      {/* Compute costs */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Compute Costs</Typography>
            <Button
              size="small"
              onClick={() => setEditCosting({})}
              disabled={updateProjectMutation.isPending || Object.keys(editCosting).length === 0}
            >
              Clear rates
            </Button>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            What an hour on this project's hardware costs. Save with the button at the top of the page.
          </Typography>
          <CostingEditor value={editCosting} onChange={setEditCosting} disabled={updateProjectMutation.isPending} />
        </CardContent>
      </Card>
      {project.permissions.contribute && <PipelineKeys projectId={project._id} />}
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
