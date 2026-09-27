import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { projectService } from './projectService';

const mockedApi = vi.mocked(visionApi);

describe('projectService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProjects passes params through', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    await projectService.getProjects({ search: 'q' });
    expect(mockedApi.get).toHaveBeenCalledWith('/projects', { params: { search: 'q' } });
  });

  it('getProjectById fetches by id', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: { _id: 'p1' } } });
    const result = await projectService.getProjectById('p1');
    expect(mockedApi.get).toHaveBeenCalledWith('/projects/p1');
    expect(result).toEqual({ success: true, data: { _id: 'p1' } });
  });

  it('getProjectDashboardStats fetches dashboard stats', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: {} } });
    await projectService.getProjectDashboardStats('p1');
    expect(mockedApi.get).toHaveBeenCalledWith('/projects/p1/dashboard-stats');
  });

  it('createProject posts project data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 'p1' } } });
    await projectService.createProject({ name: 'proj' } as any);
    expect(mockedApi.post).toHaveBeenCalledWith('/projects', { name: 'proj' });
  });

  it('updateProject puts partial data', async () => {
    mockedApi.put.mockResolvedValue({ data: { success: true, data: {} } });
    await projectService.updateProject('p1', { name: 'updated' } as any);
    expect(mockedApi.put).toHaveBeenCalledWith('/projects/p1', { name: 'updated' });
  });

  it('deleteProject deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await projectService.deleteProject('p1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/projects/p1');
  });
  it('uses the ownership and trash endpoints and unwraps groups', async () => {
    const body = { success: true, data: [] };
    mockedApi.get.mockResolvedValue({ data: body });
    mockedApi.post.mockResolvedValue({ data: body });
    mockedApi.put.mockResolvedValue({ data: body });
    mockedApi.delete.mockResolvedValue({ data: body });
    expect(await projectService.getGroups()).toEqual([]);
    expect(await projectService.getTrash()).toEqual(body);
    await projectService.restoreProject('p1');
    await projectService.deleteProjectForever('p1');
    const owner = { kind: 'group' as const, id: 'g1' };
    await projectService.transferProject('p1', owner);
    expect(mockedApi.get).toHaveBeenCalledWith('/write-capabilities/groups');
    expect(mockedApi.get).toHaveBeenCalledWith('/projects/trash');
    expect(mockedApi.post).toHaveBeenCalledWith('/projects/p1/restore');
    expect(mockedApi.delete).toHaveBeenCalledWith('/projects/p1/permanent');
    expect(mockedApi.put).toHaveBeenCalledWith('/projects/p1/owner', { owner });
  });
});
