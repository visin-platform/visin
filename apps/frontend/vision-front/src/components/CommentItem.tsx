import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Collapse
} from '@mui/material';
import {
  Reply as ReplyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { Comment } from '../types';
import { commentService } from '../services/commentService';
import CommentForm from './CommentForm';

interface CommentItemProps {
  comment: Comment;
  trainingId: string;
  onCommentUpdated: () => void;
  level?: number;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  trainingId,
  onCommentUpdated,
  level = 0
}) => {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState(comment.name);
  const [editComment, setEditComment] = useState(comment.comment);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async () => {
    if (!editName.trim() || !editComment.trim()) {
      setError('Name and comment are required');
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      await commentService.updateComment(comment._id, {
        name: editName.trim(),
        comment: editComment.trim()
      });

      setShowEditForm(false);
      onCommentUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update comment';
      setError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await commentService.deleteComment(comment._id);
      onCommentUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete comment';
      setError(message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const indentStyle = {
    marginLeft: level * 1,
    borderLeft: level > 0 ? `3px solid ${level === 1 ? '#1976d2' : '#ff9800'}` : 'none',
    paddingLeft: level > 0 ? 2 : 0,
    position: 'relative'
  };

  const connectorStyle = level > 0 ? {
    position: 'absolute',
    left: -3,
    top: -16,
    width: 3,
    height: 16,
    backgroundColor: level === 1 ? '#1976d2' : '#ff9800'
  } : {};

  return (
    <Box sx={{ ...indentStyle, mb: 2, position: 'relative' }}>
      {level > 0 && <Box sx={connectorStyle} />}
      <Paper sx={{ 
        p: 2,
        backgroundColor: level > 0 ? 'rgba(25, 118, 210, 0.04)' : 'background.paper',
        border: level > 0 ? '1px solid rgba(25, 118, 210, 0.12)' : '1px solid rgba(0, 0, 0, 0.12)'
      }}>
        {/* Comment Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {level > 0 && (
              <Typography variant="caption" color="primary" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                REPLY
              </Typography>
            )}
            <Typography variant="subtitle2" fontWeight="bold">
              {comment.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(comment.createdAt)}
            </Typography>
            {comment.updatedAt !== comment.createdAt && (
              <Typography variant="caption" color="text.secondary">
                (edited)
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {level === 0 && (
              <IconButton
                size="small"
                onClick={() => setShowReplyForm(!showReplyForm)}
                title="Reply"
              >
                <ReplyIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={() => setShowEditForm(!showEditForm)}
              title="Edit"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setDeleteConfirmOpen(true)}
              title="Delete"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Comment Content */}
        {!showEditForm ? (
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
            {comment.comment}
          </Typography>
        ) : (
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 1 }}
              disabled={isUpdating}
            />
            <TextField
              label="Comment"
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              fullWidth
              multiline
              rows={3}
              size="small"
              disabled={isUpdating}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
              <Button
                size="small"
                onClick={() => {
                  setShowEditForm(false);
                  setEditName(comment.name);
                  setEditComment(comment.comment);
                  setError(null);
                }}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleUpdate}
                disabled={isUpdating || !editName.trim() || !editComment.trim()}
              >
                {isUpdating ? 'Updating...' : 'Update'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mt: 1, mb: 1 }}>
            {error}
          </Alert>
        )}

        {/* Reply Form */}
        {level === 0 && (
          <Collapse in={showReplyForm}>
            <Box sx={{ mt: 2 }}>
              <CommentForm
                trainingId={trainingId}
                parentId={comment._id}
                onCommentAdded={() => {
                  setShowReplyForm(false);
                  onCommentUpdated();
                }}
                onCancel={() => setShowReplyForm(false)}
                placeholder="Write a reply..."
                buttonText="Post Reply"
              />
            </Box>
          </Collapse>
        )}

        {/* Replies Section */}
        {comment.replies && comment.replies.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply._id}
                comment={reply}
                trainingId={trainingId}
                onCommentUpdated={onCommentUpdated}
                level={level + 1}
              />
            ))}
          </Box>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Comment</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this comment? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommentItem;