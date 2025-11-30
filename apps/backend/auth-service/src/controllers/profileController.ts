import { Request, Response } from 'express';
import { User } from '../models/User';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    // Get the full user data from database
    const dbUser = await User.findById(req.user.id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Combine JWT user data with database user data
    const userResponse = {
      id: req.user.id,
      email: req.user.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      name: req.user.name,
      picture: req.user.picture
    };

    res.json({ 
      success: true, 
      user: userResponse, 
      approved: dbUser.isApproved 
    });
  } catch (error) {
    console.error('getProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { firstName, lastName } = req.body;

    // Validate input - allow empty strings
    if (firstName !== undefined && typeof firstName !== 'string') {
      res.status(400).json({ success: false, message: 'firstName must be a string' });
      return;
    }
    
    if (lastName !== undefined && typeof lastName !== 'string') {
      res.status(400).json({ success: false, message: 'lastName must be a string' });
      return;
    }

    // Update the user in database - handle empty strings explicitly
    const updateData: any = {};
    if (firstName !== undefined) {
      const trimmedFirstName = firstName.trim();
      updateData.firstName = trimmedFirstName === '' ? null : trimmedFirstName;
    }
    if (lastName !== undefined) {
      const trimmedLastName = lastName.trim();
      updateData.lastName = trimmedLastName === '' ? null : trimmedLastName;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Return updated user info
    res.json({
      success: true,
      user: {
        id: (updatedUser._id as any).toString(),
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        name: req.user.name, // Keep original name from JWT
        picture: req.user.picture // Keep original picture from JWT
      }
    });
  } catch (error) {
    console.error('updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};
