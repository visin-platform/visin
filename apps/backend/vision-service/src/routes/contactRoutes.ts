import express from 'express';
import {
  submitContact,
  getContacts,
  getContactById
} from '../controllers/contactController';

const router = express.Router();

// Public route for submitting contact form
router.post('/', submitContact);

// Admin routes (would need auth middleware in production)
router.get('/', getContacts);
router.get('/:id', getContactById);

export default router;