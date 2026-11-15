import { fetchWithTimeout, logger } from '@visin/backend-core';

export interface RunFinished {
  userId: string;
  trainingId: string;
  name: string;
  status: 'completed' | 'failed';
  projectName?: string;
}

/**
 * Tells chat-service that a run has finished, so its owner can be notified on their devices. Never awaited by the
 * caller and never allowed to throw: the status is already saved, and a notification is a courtesy. Where chat is not
 * deployed (`CHAT_SERVICE_URL` unset) nothing is sent: there is no address to fall back to, and a test run must
 * never reach a chat-service that happens to be running on the same machine.
 */
export async function notifyRunFinished(run: RunFinished): Promise<void> {
  const base = process.env.CHAT_SERVICE_URL;
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!base || !token) return;
  try {
    const response = await fetchWithTimeout(`${base.replace(/\/$/, '')}/api/chat/internal/run-finished`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
      body: JSON.stringify(run),
      timeoutMs: 3000,
      serviceName: 'chat-service'
    });
    if (!response.ok) logger.warn('Run notification refused', { status: response.status });
  } catch (error) {
    logger.warn('Run notification failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
