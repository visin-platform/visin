import { Request, Response } from 'express';
import { UpdateQuery } from 'mongoose';
import { NotFoundError, UnauthorizedError } from '@visin/backend-core';
import { User, IUser } from '../models/User';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  // Get the full user data from database
  const dbUser = await User.findById(req.user.id);
  if (!dbUser) {
    throw new NotFoundError('User not found');
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
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { firstName, lastName } = req.body;

  // Update the user in database - handle empty strings explicitly
  const updateData: UpdateQuery<IUser> = {};
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
    throw new NotFoundError('User not found');
  }

  // Return updated user info
  res.json({
    success: true,
    user: {
      id: updatedUser._id.toString(),
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      name: req.user.name, // Keep original name from JWT
      picture: req.user.picture // Keep original picture from JWT
    }
  });
};
