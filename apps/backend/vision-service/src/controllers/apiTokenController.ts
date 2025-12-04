import { Response } from 'express';
import crypto from 'crypto';
import ApiToken from '../models/ApiToken';
import { AuthRequest } from '../middleware/authMiddleware';

export const createToken = async (req: AuthRequest, res: Response) => {
  try {
    const { name, projectId, expiresInDays } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const prefix = rawToken.substring(0, 7);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let expiresAt = undefined;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));
    }

    const apiToken = new ApiToken({
      name,
      tokenHash,
      prefix,
      projectId,
      createdBy: userId,
      expiresAt
    });

    await apiToken.save();

    res.status(201).json({
      success: true,
      data: {
        ...apiToken.toObject(),
        token: rawToken // Return raw token only once
      }
    });
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ message: 'Error creating token', error });
  }
};

export const getTokens = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const tokens = await ApiToken.find({ projectId, isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ message: 'Error fetching tokens', error });
  }
};

export const revokeToken = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await ApiToken.findByIdAndUpdate(id, { isActive: false });
    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    console.error('Error revoking token:', error);
    res.status(500).json({ message: 'Error revoking token', error });
  }
};
