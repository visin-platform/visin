import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Alert
} from '@mui/material';
import { commentService } from '../services/commentService';
import { CreateCommentData } from '../types';

interface CommentFormProps {
  trainingId: string;
  parentId?: string;
  section?: string;
  onCommentAdded: () => void;
  onCancel?: () => void;
  placeholder?: string;
  buttonText?: string;
}

const CommentForm: React.FC<CommentFormProps> = ({
  trainingId,
  parentId,
  section,
  onCommentAdded,
  onCancel,
  placeholder = "Add a comment...",
  buttonText = "Post Comment"
}) => {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !comment.trim()) {
      setError('Name and comment are required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const commentData: CreateCommentData = {
        name: name.trim(),
        comment: comment.trim(),
        trainingId,
        section,
        parentId
      };

      await commentService.createComment(commentData);

      // Reset form
      setName('');
      setComment('');

      // Notify parent component
      onCommentAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post comment';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Paper sx={{ p: 1.5, mb: 1 }}>
      <Typography variant="subtitle1" gutterBottom>
        {parentId ? 'Reply to Comment' : 'Add Comment'}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          size="small"
          disabled={isSubmitting}
        />

        <TextField
          label="Comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required
          fullWidth
          multiline
          rows={2}
          placeholder={placeholder}
          disabled={isSubmitting}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button
              onClick={onCancel}
              disabled={isSubmitting}
              size="small"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !name.trim() || !comment.trim()}
            size="small"
          >
            {isSubmitting ? 'Posting...' : buttonText}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default CommentForm;