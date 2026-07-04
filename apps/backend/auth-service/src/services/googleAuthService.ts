import { OAuth2Client } from 'google-auth-library';
import { logger } from '@visin/backend-core';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const verifyGoogleToken = async (idToken: string) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    return payload; // Contains user info like email, name, etc.
  } catch (error) {
    logger.error('Error verifying Google token', { error: (error as Error).message });
    throw new Error('Invalid token', { cause: error });
  }
};
