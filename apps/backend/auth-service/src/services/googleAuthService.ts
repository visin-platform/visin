import { OAuth2Client } from 'google-auth-library';

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
    console.error('Error verifying Google token:', error);
    throw new Error('Invalid token', { cause: error });
  }
};
