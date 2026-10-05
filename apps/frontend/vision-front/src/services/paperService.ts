import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';
import { visionApi, visionApiOrigin } from '../config/visionApi';
import type { ApiResponse } from '../types';
import type {
  CreatePaperInput,
  Paper,
  PaperCard,
  PaperInput,
  PaperPage,
  PersonResult,
  PublicPapersQuery
} from '../types/paper';

const authApi = createApiClient({ baseUrl: () => `${getGlobalConfig().AUTH_SERVICE_URL || ''}/auth` });

export const paperService = {
  /** The public catalogue: the same for everyone, drafts never in it. */
  async listPublic(query: PublicPapersQuery = {}): Promise<PaperPage> {
    const response = await visionApi.get('/public/papers', { params: { ...query } });
    return (response.data as ApiResponse<PaperPage>).data;
  },

  /** The caller's own papers, drafts included, or their trash. */
  async listMine(scope: 'mine' | 'trash' = 'mine'): Promise<PaperCard[]> {
    const response = await visionApi.get('/papers', { params: { scope } });
    return (response.data as ApiResponse<PaperCard[]>).data;
  },

  async get(id: string): Promise<Paper> {
    const response = await visionApi.get(`/papers/${encodeURIComponent(id)}`);
    return (response.data as ApiResponse<Paper>).data;
  },

  async create(body: CreatePaperInput): Promise<Paper> {
    const response = await visionApi.post('/papers', body);
    return (response.data as ApiResponse<Paper>).data;
  },

  async update(id: string, body: Partial<PaperInput>): Promise<Paper> {
    const response = await visionApi.put(`/papers/${encodeURIComponent(id)}`, body);
    return (response.data as ApiResponse<Paper>).data;
  },

  /** Into the trash, where its owner can restore it for 30 days. */
  async trash(id: string): Promise<void> {
    await visionApi.delete(`/papers/${encodeURIComponent(id)}`);
  },

  async restore(id: string): Promise<Paper> {
    const response = await visionApi.post(`/papers/${encodeURIComponent(id)}/restore`);
    return (response.data as ApiResponse<Paper>).data;
  },

  /** Public papers that name the caller as an author and wait for their answer. */
  async authorshipRequests(): Promise<PaperCard[]> {
    const response = await visionApi.get('/papers/authorship-requests');
    return (response.data as ApiResponse<PaperCard[]>).data;
  },

  /** `true` confirms the link between an author name and the caller's account; `false` removes it. */
  async answerAuthorship(id: string, linked: boolean): Promise<void> {
    await visionApi.put(`/papers/${encodeURIComponent(id)}/authorship`, { linked });
  },

  /** People with a public page whose handle or name starts with `query`, to link an author name to. */
  async searchPeople(query: string, limit = 8): Promise<PersonResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const body = await authApi.get<{ data: PersonResult[] }>(`/users?${params}`, { skipAuthRedirect: true });
    return body.data;
  },

  /** The preview page a link to a public paper unfurls from: what the Share button copies. */
  shareUrl(id: string): string {
    return `${visionApiOrigin().replace(/\/$/, '')}/api/public/share/papers/${encodeURIComponent(id)}`;
  }
};
