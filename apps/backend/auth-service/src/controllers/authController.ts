import { Request, Response } from 'express';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  logger
} from '@visin/backend-core';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateJWT, UserPayload } from '../services/jwtService';
import { hashPassword, verifyPassword } from '../services/passwordService';
import {
  ACCESS_TOKEN_COOKIE_OPTIONS,
  displayName,
  getUserGroupRoles,
  issueSession
} from '../services/sessionService';
import { User } from '../models/User';
import { assertRegistrationOpen, createFirstUser, needsSetup } from '../services/bootstrapService';

/**
 * Lets the sign-in page decide what to show before asking for credentials: a
 * fresh deployment has no users and no way to create one, so the first visitor
 * is offered the setup form instead of a login that could never succeed.
 */
export const getSetupStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    needsSetup: await needsSetup(),
    // The sign-in page hides the Google button entirely when unconfigured,
    // rather than rendering one that fails on click.
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID)
  });
};

/**
 * The indexed user insert is the atomic bootstrap claim. If issuing the session
 * fails after that commit, the new owner recovers through ordinary password login.
 */
export const setupFirstUser = async (req: Request, res: Response): Promise<void> => {
  const dbUser = await createFirstUser(req.body);

  logger.info('First user created via setup', { email: dbUser.email });

  const name = displayName(dbUser);
  const { payload, token } = await issueSession(res, dbUser, name);
  res.status(201).json({ success: true, user: payload, token });
};

/**
 * Self-registration, which signs the new account straight in. There is no
 * approval step: what a user can actually reach is decided by group
 * membership and by whether a project is public, so an account with no groups
 * sees only public work and gates nothing behind an administrator's inbox.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  await assertRegistrationOpen();
  const { email, password, firstName, lastName } = req.body as {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };

  const normalizedEmail = email.toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw new ConflictError('An account with that email already exists');
  }

  const dbUser = await User.create({
    email: normalizedEmail,
    firstName,
    lastName,
    signupMethod: 'password',
    passwordHash: await hashPassword(password),
    roles: [],
    lastLoginAt: new Date()
  });

  logger.info('User registered', { email: normalizedEmail });

  const { payload, token } = await issueSession(res, dbUser, displayName(dbUser));
  res.status(201).json({ success: true, user: payload, token });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };

  // passwordHash is select:false on the schema, so it has to be asked for.
  const dbUser = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // One message for "no such user" and "wrong password", so the response can't
  // be used to enumerate which emails have accounts.
  const ok = dbUser ? await verifyPassword(password, dbUser.passwordHash) : false;
  if (!dbUser || !ok) {
    throw new UnauthorizedError('Incorrect email or password');
  }

  await User.updateOne({ _id: dbUser._id }, { $set: { lastLoginAt: new Date() } });

  const name = displayName(dbUser);
  const { payload, token } = await issueSession(res, dbUser, name);
  res.json({ success: true, user: payload, token });
};

export const validateToken = async (req: Request, res: Response): Promise<void> => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new ForbiddenError('Google sign-in is not configured on this instance');
  }

  const { idToken } = req.body;

  let googleUser;
  try {
    googleUser = await verifyGoogleToken(idToken);
  } catch {
    throw new UnauthorizedError('Invalid Google token');
  }
  if (!googleUser) {
    throw new UnauthorizedError('Invalid Google token');
  }

  const userEmail = googleUser.email || '';
  if (!userEmail) {
    throw new UnauthorizedError('Email not present in Google token');
  }

  // Find existing user only
  const dbUser = await User.findOne({ email: userEmail.toLowerCase() });

  if (!dbUser) {
    throw new NotFoundError('User not found');
  }

  // Update last login
  await User.updateOne({ _id: dbUser._id }, { $set: { lastLoginAt: new Date() } });

  // Update userPayload to use database user ID instead of Google sub
  const userPayload: UserPayload = {
    id: dbUser._id.toString(), // Use MongoDB _id instead of Google sub
    email: googleUser.email || '',
    name: googleUser.name || '',
    picture: googleUser.picture,
    tokenVersion: dbUser.tokenVersion || 1
  };

  // Fetch user group roles and include in JWT payload
  const groupRoles = await getUserGroupRoles(userPayload.email);

  const jwtPayload: UserPayload = {
    ...userPayload,
    groupRoles
  };

  const jwtToken = generateJWT(jwtPayload);

  // Set secure cookie for SSO across subdomains
  res.cookie('access_token', jwtToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  res.json({
    success: true,
    user: userPayload,
    token: jwtToken
  });
};

export const logout = (req: Request, res: Response): void => {
  res.clearCookie('access_token', {
    domain: process.env.COOKIE_DOMAIN || 'localhost',
    path: '/'
  });
  res.json({ success: true, message: 'Logged out successfully' });
};

export const invalidateUserTokens = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  // Increment token version to invalidate all existing tokens for this user
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );

  if (!user) {
    throw new NotFoundError('User not found');
  }

  logger.info('Invalidated tokens for user', { email, newTokenVersion: user.tokenVersion });

  res.json({
    success: true,
    message: 'User tokens invalidated successfully',
    newTokenVersion: user.tokenVersion
  });
};


export const verifyAuth = async (req: Request, res: Response): Promise<void> => {
  const currentUser = req.user;
  if (!currentUser?.email) {
    throw new UnauthorizedError('No authenticated user');
  }

  // Fetch fresh user group roles
  const groupRoles = await getUserGroupRoles(currentUser.email);

  // Generate new JWT with fresh roles
  const jwtPayload: UserPayload = {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name || '',
    picture: currentUser.picture,
    groupRoles,
    tokenVersion: currentUser.tokenVersion || 1
  };

  const newToken = generateJWT(jwtPayload);

  // Update cookie with fresh token
  res.cookie('access_token', newToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  logger.info('Generated new token with fresh group roles', {
    email: currentUser.email,
    groupRoles
  });

  res.json({
    success: true,
    authenticated: true,
    user: jwtPayload,
    token: newToken
  });
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  // Get current user from JWT
  const currentUser = req.user;
  if (!currentUser?.email) {
    throw new UnauthorizedError('No authenticated user');
  }

  // Fetch fresh user group roles
  const groupRoles = await getUserGroupRoles(currentUser.email);

  // Generate new JWT with updated roles
  const jwtPayload: UserPayload = {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name || '',
    picture: currentUser.picture,
    groupRoles,
    tokenVersion: currentUser.tokenVersion || 1
  };

  const newToken = generateJWT(jwtPayload);

  // Update cookie
  res.cookie('access_token', newToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  res.json({
    success: true,
    token: newToken,
    groupRoles
  });
};

// Admin utility: list users
export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, users });
};
