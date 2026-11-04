import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

export interface ManagedAssistant {
  _id: string;
  name: string;
  personality: string;
  paused: boolean;
}
function serviceUrl(service: 'CHAT_SERVICE_URL' | 'AUTH_SERVICE_URL', path: string) {
  const base = getGlobalConfig()[service];
  if (!base) throw new Error('Assistant profile editing is not configured');
  return `${base.replace(/\/$/, '')}${path}`;
}
const chat = createApiClient({ baseUrl: () => serviceUrl('CHAT_SERVICE_URL', '/api/chat') });
const auth = createApiClient({ baseUrl: () => serviceUrl('AUTH_SERVICE_URL', '/auth') });
export const assistantProfileApi = {
  async list() {
    return (await chat.get<{ data: ManagedAssistant[] }>('/assistants')).data;
  },
  async rename(assistant: ManagedAssistant, name: string) {
    return (
      await chat.post<{ data: ManagedAssistant }>(`/assistants/${assistant._id}`, {
        name,
        personality: assistant.personality,
        paused: assistant.paused
      })
    ).data;
  },
  async saveProfile(assistantId: string, input: { handle: string; bio: string; public: boolean }) {
    return (
      await chat.post<{ data: { handle: string; bio: string; public: boolean } }>(
        `/assistants/${assistantId}/profile`,
        input
      )
    ).data;
  },
  async upload(userId: string, image: Blob) {
    await auth.request(`/bots/${encodeURIComponent(userId)}/picture`, {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': image.type }
    });
  },
  async remove(userId: string) {
    await auth.delete(`/bots/${encodeURIComponent(userId)}/picture`);
  }
};
