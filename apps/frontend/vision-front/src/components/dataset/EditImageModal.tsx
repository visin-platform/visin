import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography
} from '@mui/material';
import { ImageCondition } from '../../services/datasetImageService';
import { ImageCategory } from '../../services/imageCategoryService';
import { humanize } from '../../taxonomy/humanize';

interface EditImageModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  categories: ImageCategory[];
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
  selectedCondition: ImageCondition;
  setSelectedCondition: (condition: ImageCondition) => void;
  /**
   * Conditions already seen in this dataset, offered as suggestions. Not a closed
   * list: ingest pipelines set conditions over the API, so a value that has never
   * been seen here is still valid and typing a new one is allowed.
   */
  conditionOptions?: string[];
  /** what the condition axis is called — "Weather", "Scenario", "Site", … */
  conditionLabel?: string;
  selectedTags: string;
  setSelectedTags: (tags: string) => void;
}

const EditImageModal: React.FC<EditImageModalProps> = ({
  open,
  onClose,
  onSave,
  categories,
  selectedCategory,
  setSelectedCategory,
  selectedCondition,
  setSelectedCondition,
  conditionOptions = [],
  conditionLabel = 'Condition',
  selectedTags,
  setSelectedTags
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit Image
      </DialogTitle>
      <DialogContent>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 2
          }}>
          Update the category, {conditionLabel.toLowerCase()}, and tags for this image.
        </Typography>
        <TextField
          select
          fullWidth
          label="Category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          slotProps={{
            select: {
              native: true,
            }
          }}
          sx={{ mb: 2 }}
        >
          <option value="">No Category</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </TextField>
        <TextField
          fullWidth
          label={conditionLabel}
          value={selectedCondition}
          onChange={(e) => setSelectedCondition(e.target.value)}
          slotProps={{ htmlInput: { list: 'image-condition-options' } }}
          helperText={
            conditionOptions.length > 0
              ? `Existing values: ${conditionOptions.join(', ')}. Any value is allowed.`
              : 'Any value is allowed. Leave blank for none.'
          }
          sx={{ mb: 2 }}
        />
        <datalist id="image-condition-options">
          {conditionOptions.map((condition) => (
            <option key={condition} value={condition}>
              {humanize(condition)}
            </option>
          ))}
        </datalist>
        <TextField
          fullWidth
          label="Tags"
          value={selectedTags}
          onChange={(e) => setSelectedTags(e.target.value)}
          helperText="Enter tags separated by commas (e.g., cat, animal, pet)"
          placeholder="tag1, tag2, tag3"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditImageModal;
