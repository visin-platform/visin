import React from 'react';
import { OwnerPicker, VisibilitySwitch, type OwnerRef, type OwnerGroup } from '@visin/frontend-core';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import TaxonomyEditor from './taxonomy/TaxonomyEditor';
import CostingEditor from './taxonomy/CostingEditor';
import { ProjectCosting, ProjectTaxonomy } from '../types/taxonomy';

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  isEditing: boolean;
  isCreating: boolean;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  isPublic: boolean;
  onIsPublicChange: (value: boolean) => void;
  owner: OwnerRef;
  onOwnerChange: (value: OwnerRef) => void;
  userId: string;
  groups: OwnerGroup[];
  groupsLoading?: boolean;
  groupsError?: boolean;
  canShare: boolean;
  taxonomy: ProjectTaxonomy;
  onTaxonomyChange: (taxonomy: ProjectTaxonomy) => void;
  costing: ProjectCosting;
  onCostingChange: (costing: ProjectCosting) => void;
  error: string | null;
  success: string | null;
}

export const ProjectFormDialog: React.FC<ProjectFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isEditing,
  isCreating,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  isPublic,
  onIsPublicChange,
  owner,
  onOwnerChange,
  userId,
  groups,
  groupsLoading,
  groupsError,
  canShare,
  taxonomy,
  onTaxonomyChange,
  costing,
  onCostingChange,
  error,
  success
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Project' : 'Create New Project'}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Project Name"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Autonomous Driving Research"
          disabled={isCreating}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !isCreating && name.trim()) {
              onSubmit();
            }
          }}
          sx={{ mb: 2 }}
        />
        <TextField
          margin="dense"
          label="Description (Optional)"
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add a description for this project..."
          disabled={isCreating}
          sx={{ mb: 2 }}
        />
        {!isEditing && (
          <OwnerPicker
            value={owner}
            onChange={onOwnerChange}
            userId={userId}
            groups={groups}
            disabled={isCreating || groupsLoading}
            helperText={groupsError ? 'Could not load your groups' : undefined}
          />
        )}
        <VisibilitySwitch
          value={isPublic ? 'public' : 'private'}
          onChange={(value) => onIsPublicChange(value === 'public')}
          canMakePublic={canShare}
          disabled={isCreating || !canShare}
        />
        <Typography variant="body2" color="text.secondary">
          Trainings, results and configs follow this project's visibility.
        </Typography>
        <Accordion sx={{ mt: 2 }} disableGutters elevation={0} variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Customise how results are labelled (optional)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TaxonomyEditor value={taxonomy} onChange={onTaxonomyChange} disabled={isCreating} compact />
          </AccordionDetails>
        </Accordion>
        <Accordion sx={{ mt: 1 }} disableGutters elevation={0} variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Set compute cost rates (optional)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <CostingEditor value={costing} onChange={onCostingChange} disabled={isCreating} />
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isCreating}>
          Cancel
        </Button>
        <Button onClick={onSubmit} variant="contained" disabled={isCreating || !name.trim()}>
          {isCreating ? <CircularProgress size={24} /> : isEditing ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectFormDialog;
