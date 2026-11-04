import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

const client = createApiClient({
  baseUrl: () => {
    const base = getGlobalConfig().AUTH_SERVICE_URL;
    if (!base) throw new Error('Profile images are not configured');
    return `${base.replace(/\/$/, '')}/auth`;
  }
});
export const botPictureService = {
  previewUrl(userId: string, version: string) {
    const base = getGlobalConfig().AUTH_SERVICE_URL;
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/auth/bots/${encodeURIComponent(userId)}/picture?v=${encodeURIComponent(version)}`;
  },
  async upload(userId: string, image: Blob) {
    const result = await client.request<{ data: { picture: string } }>(`/bots/${encodeURIComponent(userId)}/picture`, {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': image.type }
    });
    return result.data.picture;
  },
  async remove(userId: string) {
    await client.delete(`/bots/${encodeURIComponent(userId)}/picture`);
  }
};
