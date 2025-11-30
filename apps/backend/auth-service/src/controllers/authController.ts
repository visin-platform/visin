import { Request, Response, NextFunction } from 'express';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateJWT, UserPayload } from '../services/jwtService';
import { User } from '../models/User';

export const validateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }
    const googleUser = await verifyGoogleToken(idToken);

    if (!googleUser) {
      res.status(401).json({ success: false, message: 'Invalid Google token' });
      return;
    }

    const userEmail = googleUser.email || '';
    if (!userEmail) {
      res.status(400).json({ success: false, message: 'Email not present in Google token' });
      return;
    }

    // Upsert DB user (automatic approval for new users)
    const dbUser = await User.findOneAndUpdate(
      { email: userEmail.toLowerCase() },
      {
        $setOnInsert: {
          email: userEmail.toLowerCase(),
          signupMethod: 'google',
          isApproved: true
        },
        $set: { lastLoginAt: new Date() }
      },
      { new: true, upsert: true }
    );

    if (!dbUser) {
      res.status(500).json({ success: false, message: 'Failed to create or find user' });
      return;
    }

    // Update userPayload to use database user ID instead of Google sub
    const userPayload: UserPayload = {
      id: (dbUser._id as any).toString(), // Use MongoDB _id instead of Google sub
      email: googleUser.email || '',
      name: googleUser.name || '',
      picture: googleUser.picture,
      tokenVersion: dbUser.tokenVersion || 1
    };

    // Fetch user groups and include in JWT payload
    const userGroups = await getUserGroups(userPayload.email);

    // Include groups in the JWT payload
    const jwtPayload: UserPayload = {
      ...userPayload,
      groups: userGroups
    };

    const jwtToken = generateJWT(jwtPayload);

    // Set secure cookie for SSO across subdomains
    const cookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      domain: process.env.COOKIE_DOMAIN || 'localhost',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    res.cookie('access_token', jwtToken, cookieOptions);

    res.json({
      success: true,
      user: userPayload,
      approved: dbUser.isApproved,
      token: jwtToken
    });
  } catch (error) {
    console.error('validateToken error:', error);
    const message = error instanceof Error ? error.message : 'Token validation failed';
    res.status(401).json({ success: false, message });
  }
};

export const logout = (req: Request, res: Response): void => {
  res.clearCookie('access_token', {
    domain: process.env.COOKIE_DOMAIN || 'localhost',
    path: '/'
  });
  res.json({ success: true, message: 'Logged out successfully' });
};

export const invalidateUserTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    // Increment token version to invalidate all existing tokens for this user
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    console.log(`Invalidated tokens for user: ${email} (new tokenVersion: ${user.tokenVersion})`);

    res.json({
      success: true,
      message: 'User tokens invalidated successfully',
      newTokenVersion: user.tokenVersion
    });
  } catch (error) {
    console.error('Token invalidation error:', error);
    const message = error instanceof Error ? error.message : 'Token invalidation failed';
    res.status(500).json({ success: false, message });
  }
};

const getUserGroups = async (email: string): Promise<string[]> => {
  // Fetch fresh data from group service
  let userGroups: string[] = [];
  try {
    const groupServiceUrl = process.env.GROUP_API_URL;
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

    if (groupServiceUrl && internalToken) {
      const groupResponse = await fetch(`${groupServiceUrl}/api/groups/mine/ids?userEmail=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
          'x-service-id': 'auth-service'
        },
        signal: AbortSignal.timeout(3000)
      });

      if (groupResponse.ok) {
        const groupResult = await groupResponse.json();
        if (groupResult.success) {
          userGroups = groupResult.data || [];
        }
      }
    }
  } catch (error) {
    console.warn('Failed to fetch user groups for JWT:', error);
  }

  return userGroups;
};

export const verifyAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user as UserPayload;
    if (!currentUser?.email) {
      res.status(401).json({ success: false, message: 'No authenticated user' });
      return;
    }

    // Fetch fresh user groups
    const userGroups = await getUserGroups(currentUser.email);

    // Generate new JWT with fresh groups
    const jwtPayload: UserPayload = {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      picture: currentUser.picture,
      groups: userGroups,
      tokenVersion: currentUser.tokenVersion || 1
    };

    const newToken = generateJWT(jwtPayload);

    // Update cookie with fresh token
    const cookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      domain: process.env.COOKIE_DOMAIN || 'localhost',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    res.cookie('access_token', newToken, cookieOptions);

    console.log(`✅ Generated new token with ${userGroups.length} groups for user: ${currentUser.email}`);

    res.json({
      success: true,
      authenticated: true,
      user: jwtPayload,
      token: newToken
    });
  } catch (error) {
    console.error('Verify auth error:', error);
    const message = error instanceof Error ? error.message : 'Verification failed';
    res.status(500).json({ success: false, message });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get current user from JWT
    const currentUser = (req as any).user as UserPayload;
    if (!currentUser?.email) {
      res.status(401).json({ success: false, message: 'No authenticated user' });
      return;
    }

    // Fetch fresh user groups
    const userGroups = await getUserGroups(currentUser.email);

    // Generate new JWT with updated groups
    const jwtPayload: UserPayload = {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      picture: currentUser.picture,
      groups: userGroups,
      tokenVersion: currentUser.tokenVersion || 1
    };

    const newToken = generateJWT(jwtPayload);

    // Update cookie
    const cookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      domain: process.env.COOKIE_DOMAIN || 'localhost',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    res.cookie('access_token', newToken, cookieOptions);

    res.json({
      success: true,
      token: newToken,
      groups: userGroups
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    res.status(500).json({ success: false, message });
  }
};
