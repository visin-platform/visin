import { assistantStatus, isPlatformAdmin } from './settings';

/** What the assistant side contributes to the capabilities a page reads: whether Vivi can answer, with what, and whether this person can set it up. */
export async function assistantCapabilities(userId: string) {
  const [status, canConfigure] = await Promise.all([
    assistantStatus(),
    // Only decides whether the settings are offered; the settings routes check it again.
    isPlatformAdmin(userId).catch(() => false)
  ]);
  return {
    assistant: status.ready,
    assistantModel: { provider: status.settings.provider, model: status.settings.model, ready: status.ready },
    canConfigure
  };
}
