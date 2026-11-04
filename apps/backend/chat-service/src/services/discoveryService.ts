import { type Request } from 'express';
import { groups, peer, publicPerson, sharedContacts, type Project } from './access';
import { assistantStatus, isPlatformAdmin } from './settings';

export async function getCapabilities(userId: string) {
  const [status, canConfigure] = await Promise.all([
    assistantStatus(),
    // Only decides whether the settings are offered; the settings routes check it again.
    isPlatformAdmin(userId).catch(() => false)
  ]);
  return {
    assistant: status.ready,
    sharedAssistant: true,
    assistantModel: { provider: status.settings.provider, model: status.settings.model, ready: status.ready },
    canConfigure
  };
}

export async function listGroups(userId: string) {
  return await groups.getMyGroups(userId);
}

export async function listProjects(req: Request) {
  const result = await peer<{ projects: Project[] }>('VISION', '/api/projects?limit=100', req);
  return result.projects || [];
}

export async function listContacts(req: Request) {
  return await sharedContacts(req);
}

export async function getPerson(handleValue: unknown) {
  return await publicPerson(String(handleValue));
}
