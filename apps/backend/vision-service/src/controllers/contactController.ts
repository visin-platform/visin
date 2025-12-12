import { Response } from 'express';
import Contact from '../models/Contact';
import { Request } from 'express';

// Submit contact form
export const submitContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
      return;
    }

    // Create contact submission
    const contact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim()
    });

    await contact.save();

    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
      data: {
        id: contact._id,
        createdAt: contact.createdAt
      }
    });
  } catch (error) {
    console.error('Error submitting contact form:', error);

    // Handle validation errors
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values((error as any).errors).map((err: any) => err.message)
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form'
    });
  }
};

// Get all contacts (admin only - would need auth middleware in production)
export const getContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const contacts = await Contact.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await Contact.countDocuments({});

    res.json({
      success: true,
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
};

// Get contact by ID
export const getContactById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id);

    if (!contact) {
      res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
      return;
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact'
    });
  }
};