import { assistantService } from '../services/assistantService';

/** How long chat waits to learn who the default is before starting without: an answer is not worth a stalled chat. */
const WAIT_MS = 2500;

/**
 * The effective default for this person, including the published platform assistant. Failures leave resolution to the server. Returning the same effective ID also finds an existing
 * thread started with that assistant, rather than opening another generic analysis.
 */
export async function defaultAssistantId(): Promise<string | undefined> {
  try {
    const assistant = await assistantService.default(AbortSignal.timeout(WAIT_MS));
    return assistant?._id;
  } catch {
    return undefined;
  }
}
