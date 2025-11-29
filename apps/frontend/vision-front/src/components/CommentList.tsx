import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Collapse
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  Refresh as RefreshIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { commentService } from '../services/commentService';
import { Comment } from '../types';
import CommentItem from './CommentItem';
import CommentForm from './CommentForm';

interface CommentListProps {
  trainingId: string;
}

const CommentList: React.FC<CommentListProps> = ({ trainingId }) => {
  const [showAddForm, setShowAddForm] = useState(false);

  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['comments', trainingId],
    queryFn: () => commentService.getCommentsByTraining(trainingId),
    enabled: !!trainingId
  });

  const comments = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const handleCommentAdded = () => {
    setShowAddForm(false);
    refetch();
  };

  const handleCommentUpdated = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load comments'}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Comments ({pagination?.total || 0})
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            Add Comment
          </Button>
        </Box>
      </Box>

      {/* Add Comment Form */}
      <Collapse in={showAddForm}>
        <Box sx={{ mb: 3 }}>
          <CommentForm
            trainingId={trainingId}
            onCommentAdded={handleCommentAdded}
            onCancel={() => setShowAddForm(false)}
          />
        </Box>
      </Collapse>

      {/* Comments List */}
      {comments.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No comments yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Be the first to add a comment about this training session.
          </Typography>
        </Box>
      ) : (
        <Box>
          {comments.map((comment: Comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              trainingId={trainingId}
              onCommentUpdated={handleCommentUpdated}
            />
          ))}

          {/* Pagination Info */}
          {pagination && pagination.pages > 1 && (
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Showing page {pagination.page} of {pagination.pages} ({pagination.total} total comments)
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default CommentList;