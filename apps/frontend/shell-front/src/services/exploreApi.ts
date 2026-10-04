import { ApiError, createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

/** Who owns something, as far as the owner agreed to show: a person without a name has hidden their profile. */
export interface ExploreOwner {
  kind: 'user' | 'group';
  id: string;
  /** A group's name only to its members; a person's as they agreed to show it. */
  name?: string;
  /** The address of a person's public page, `/u/{handle}`. */
  handle?: string;
  picture?: string;
}

/** Whose work a list is of: a person's (by account id) or a group's (by group id). */
export type OwnerFilter = { user: string; owner?: undefined } | { owner: string; user?: undefined };

/** What anyone may know of a group that turned its public page on; never its members. */
export interface PublicGroup {
  id: string;
  handle: string;
  name: string;
  description?: string;
  createdAt: string;
}

/** What anyone may see of an account (auth-service's public page); never the email. */
export interface PublicUser {
  id: string;
  handle: string;
  name: string;
  picture?: string;
  bio?: string;
  links: string[];
  createdAt: string;
}

/** A project as Explore shows it: the fields of vision-service's project the cards read. */
export interface ExploreProject {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  visibility: 'private' | 'public';
  owner: ExploreOwner;
  updatedAt: string;
}

/** A dataset as Explore shows it. */
export interface ExploreDataset {
  _id: string;
  name: string;
  description?: string;
  visibility: 'private' | 'public';
  owner: ExploreOwner;
  imageCount: number;
  groups: { name: string; images: number }[];
  coverUrl?: string;
  updatedAt: string;
}

/** One row of the recorded leaderboard, as vision-service sends it anonymously. */
export interface LeaderboardEntry {
  rank: number;
  evaluationId: string;
  checkpoint?: { kind: 'hf'; repo: string; commit: string } | { kind: 'local'; label: string };
  run?: { name: string };
  project: { name: string };
  dataset?: string;
  epoch?: number;
  value: number;
  verified: boolean;
}

export interface Leaderboard {
  metric?: string;
  direction: 'max' | 'min';
  entries: LeaderboardEntry[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

// Everything here is readable without an account; the session cookie only widens it
// to what the viewer's groups share, which Explore then filters back out.
const visionApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().VISION_API_URL ?? '')}/api`
});
const datasetApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().DATASET_API_URL ?? '')}/api/datasets`
});
const groupApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().GROUP_SERVICE_URL ?? '')}/api`
});
const authApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().AUTH_SERVICE_URL ?? '')}/auth`
});

export const exploreApi = {
  /**
   * Projects anyone can open, most recently updated first. Explore is the public
   * catalogue, so the viewer's own private projects (which the list also returns
   * to them) are left to the Projects page.
   */
  async projects(options: Partial<OwnerFilter> = {}): Promise<ExploreProject[]> {
    const query = new URLSearchParams({ sortBy: 'updatedAt', sortOrder: 'desc' });
    if (options.user) query.set('user', options.user);
    if (options.owner) query.set('owner', options.owner);
    const { data } = await visionApi.get<Envelope<ExploreProject[]>>(`/projects?${query}`);
    return data.filter((project) => project.visibility === 'public');
  },

  async datasets(limit: number, options: Partial<OwnerFilter> = {}): Promise<ExploreDataset[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (options.user) query.set('user', options.user);
    if (options.owner) query.set('owner', options.owner);
    const { data } = await datasetApi.get<Envelope<{ datasets: ExploreDataset[] }>>(`?${query}`);
    return data.datasets.filter((dataset) => dataset.visibility === 'public');
  },

  /** A person's public page, or null where there is none: no such handle, or the person hid theirs. */
  async user(handle: string): Promise<PublicUser | null> {
    try {
      return (
        await authApi.get<Envelope<PublicUser>>(`/users/${encodeURIComponent(handle)}`, { skipAuthRedirect: true })
      ).data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  /** A group's public page, or null where there is none: no such handle, or the group's owner has not turned it on. */
  async group(handle: string): Promise<PublicGroup | null> {
    try {
      return (
        await groupApi.get<Envelope<PublicGroup>>(`/public/groups/${encodeURIComponent(handle)}`, { skipAuthRedirect: true })
      ).data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  /** The best recorded results across public projects, whoever verified them. */
  async leaderboard(limit: number): Promise<Leaderboard> {
    return (await visionApi.get<Envelope<Leaderboard>>(`/evaluations/leaderboard?verification=all&limit=${limit}`)).data;
  }
};

/** What a leaderboard row calls its model: the pinned Hub model, the weights' label, else the run. */
export function entryName(entry: LeaderboardEntry): string {
  const { checkpoint } = entry;
  if (checkpoint?.kind === 'hf') return `${checkpoint.repo} @ ${checkpoint.commit.slice(0, 7)}`;
  if (checkpoint?.kind === 'local') return checkpoint.label;
  return entry.run?.name ?? 'Evaluation';
}
