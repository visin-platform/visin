import { type Request } from 'express';
import { groups, peer, type Project, publicPerson, sharedContacts } from './access';
import { attachmentsEnabled } from './attachments';
import { capabilities as assistantCapabilities } from './assistantClient';

export async function getCapabilities(userId: string) {
  return {
    ...(await assistantCapabilities(userId)),
    sharedAssistant: true,
    // Whether files can be sent: this server has somewhere to keep them.
    attachments: attachmentsEnabled()
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
  return await sharedContacts(req, typeof req.query.groupId === 'string' ? req.query.groupId : undefined);
}

export async function getPerson(handleValue: unknown) {
  return await publicPerson(String(handleValue));
}
