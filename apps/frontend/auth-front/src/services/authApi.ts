import { createApiClient, ApiError } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

const client = createApiClient({ baseUrl: () => getGlobalConfig().AUTH_SERVICE_URL || '' });

export interface SetupStatus {
  /** True while the instance has no users — the first visitor creates the owner. */
  needsSetup: boolean;
  /** False when the server has no GOOGLE_CLIENT_ID, so the button is hidden. */
  googleEnabled: boolean;
}

export interface Credentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/** Turns any failure into the server's own message, which is written for users. */
const messageFor = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const data = await client.get<{ success: boolean } & SetupStatus>('/auth/setup-status', {
    skipAuthRedirect: true
  });
  return { needsSetup: Boolean(data.needsSetup), googleEnabled: Boolean(data.googleEnabled) };
};

export const setupFirstUser = async (credentials: Credentials): Promise<void> => {
  try {
    await client.post('/auth/setup', credentials);
  } catch (error) {
    throw new Error(messageFor(error, 'Could not create the account'), { cause: error });
  }
};

/** Creates the account and signs it in — there is no approval step. */
export const register = async (credentials: Credentials): Promise<void> => {
  try {
    await client.post('/auth/register', credentials);
  } catch (error) {
    throw new Error(messageFor(error, 'Could not create the account'), { cause: error });
  }
};

export const login = async (email: string, password: string): Promise<void> => {
  try {
    await client.post('/auth/login', { email, password }, { skipAuthRedirect: true });
  } catch (error) {
    throw new Error(messageFor(error, 'Could not sign in'), { cause: error });
  }
};
