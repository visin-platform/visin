import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
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
        <FormControlLabel
          control={
            <Switch
              checked={isPublic}
              onChange={(e) => onIsPublicChange(e.target.checked)}
              disabled={isCreating}
            />
          }
          label="Public Project (Visible to everyone)"
        />
        <Accordion sx={{ mt: 2 }} disableGutters elevation={0} variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Customise how results are labelled (optional)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TaxonomyEditor
              value={taxonomy}
              onChange={onTaxonomyChange}
              disabled={isCreating}
              compact
            />
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
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isCreating || !name.trim()}
        >
          {isCreating ? <CircularProgress size={24} /> : (isEditing ? 'Update' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectFormDialog;
