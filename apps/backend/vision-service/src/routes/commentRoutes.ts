import express from 'express';
import {
  getCommentsByTraining,
  createComment,
  updateComment,
  deleteComment
} from '../controllers/commentController';

const router = express.Router();

// Comment routes
router.get('/training/:trainingId', getCommentsByTraining);
router.post('/', createComment);
router.put('/:id', updateComment);
router.delete('/:id', deleteComment);

export default router;