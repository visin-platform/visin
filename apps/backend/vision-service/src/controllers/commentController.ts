import { Request, Response } from 'express';
import Comment from '../models/Comment';

// Get all comments for a training
export const getCommentsByTraining = async (req: Request, res: Response): Promise<void> => {
  try {
    const { trainingId } = req.params;
    const { page = 1, limit = 50, section } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build query
    const query: any = { trainingId };
    if (section) {
      query.section = section;
    }

    // Get all comments for this training (optionally filtered by section)
    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Comment.countDocuments(query);

    res.json({
      success: true,
      data: {
        comments,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comments';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comments',
      error: errorMessage
    });
  }
};

// Create a new comment
export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, comment, trainingId, section, parentId } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Name is required'
      });
      return;
    }

    if (!comment || !comment.trim()) {
      res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
      return;
    }

    if (!trainingId) {
      res.status(400).json({
        success: false,
        message: 'Training ID is required'
      });
      return;
    }

    // If this is a reply (has parentId), add it to the parent comment's replies
    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      if (!parentComment) {
        res.status(404).json({
          success: false,
          message: 'Parent comment not found'
        });
        return;
      }

      const replyData = {
        name: name.trim(),
        comment: comment.trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      parentComment.replies = parentComment.replies || [];
      parentComment.replies.push(replyData);
      parentComment.updatedAt = new Date();

      const savedParent = await parentComment.save();

      // Return the newly added reply
      const newReply = savedParent.replies![savedParent.replies!.length - 1];
      res.status(201).json({
        success: true,
        message: 'Reply created successfully',
        data: {
          ...newReply,
          _id: newReply._id,
          trainingId,
          section,
          parentId
        }
      });
      return;
    }

    // This is a top-level comment
    const newComment = new Comment({
      name: name.trim(),
      comment: comment.trim(),
      trainingId,
      section: section || undefined,
      parentId: parentId || undefined
    });

    const savedComment = await newComment.save();

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: savedComment
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create comment';
    res.status(500).json({
      success: false,
      message: 'Failed to create comment',
      error: errorMessage
    });
  }
};

// Update a comment
export const updateComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, comment } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID format'
      });
      return;
    }

    // First, try to find a top-level comment
    const commentDoc = await Comment.findById(id);

    if (commentDoc) {
      // This is a top-level comment, update it
      if (name !== undefined) commentDoc.name = name.trim();
      if (comment !== undefined) commentDoc.comment = comment.trim();
      commentDoc.updatedAt = new Date();

      const updatedComment = await commentDoc.save();

      res.json({
        success: true,
        message: 'Comment updated successfully',
        data: updatedComment
      });
      return;
    }

    // If not found as top-level, look for it as a reply in some parent comment
    const parentComment = await Comment.findOne({ 'replies._id': id });

    if (!parentComment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
      return;
    }

    // Find and update the reply in the parent's replies array
    const replyIndex = (parentComment.replies || []).findIndex(reply => reply._id?.toString() === id);
    if (replyIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
      return;
    }

    if (name !== undefined) parentComment.replies![replyIndex].name = name.trim();
    if (comment !== undefined) parentComment.replies![replyIndex].comment = comment.trim();
    parentComment.replies![replyIndex].updatedAt = new Date();
    parentComment.updatedAt = new Date();

    const updatedParent = await parentComment.save();

    res.json({
      success: true,
      message: 'Reply updated successfully',
      data: updatedParent.replies![replyIndex]
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update comment';
    res.status(500).json({
      success: false,
      message: 'Failed to update comment',
      error: errorMessage
    });
  }
};

// Delete a comment and its replies
export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400).json({
        success: false,
        message: 'Invalid comment ID format'
      });
      return;
    }

    // First, try to find a top-level comment
    const comment = await Comment.findById(id);

    if (comment) {
      // This is a top-level comment, delete it
      await Comment.findByIdAndDelete(id);
      res.json({
        success: true,
        message: 'Comment and all replies deleted successfully'
      });
      return;
    }

    // If not found as top-level, look for it as a reply in some parent comment
    const parentComment = await Comment.findOne({ 'replies._id': id });

    if (!parentComment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
      return;
    }

    // Remove the reply from the parent's replies array
    parentComment.replies = (parentComment.replies || []).filter(reply => reply._id?.toString() !== id);
    parentComment.updatedAt = new Date();
    await parentComment.save();

    res.json({
      success: true,
      message: 'Reply deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete comment';
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment',
      error: errorMessage
    });
  }
};