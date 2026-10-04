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
  /** Whether the page may list what they have been doing. */
  showActivity: boolean;
  createdAt: string;
}

export interface ActivityProject {
  id: string;
  name: string;
  slug?: string;
}

/** One line of a person's or a group's public activity; always about something public. */
export type ActivityItem =
  | { kind: 'project.created'; at: string; project: ActivityProject }
  | {
      kind: 'finding.posted';
      at: string;
      project: ActivityProject;
      finding: { id: string; title: string; authorKind: 'person' | 'assistant'; authorLabel: string };
    }
  | { kind: 'training.run'; at: string; project: ActivityProject; count: number }
  | {
      kind: 'evaluation.recorded';
      at: string;
      project: ActivityProject;
      evaluation: { id: string; status: 'completed' | 'failed'; suite?: { slug: string; version: number } };
    }
  | { kind: 'dataset.created'; at: string; dataset: { id: string; name: string; imageCount: number } };

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

/** Lines of activity a page shows. */
export const ACTIVITY_LIMIT = 30;

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

  /**
   * What a person or a group has been doing in public, newest first, from Vision (projects, findings, runs,
   * results) and the dataset service (datasets made). Either may be unconfigured or down: the feed is then what the
   * other had, and only when both fail is it an error.
   */
  async activity(filter: OwnerFilter, limit = ACTIVITY_LIMIT): Promise<ActivityItem[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (filter.user) query.set('user', filter.user);
    if (filter.owner) query.set('owner', filter.owner);
    const config = getGlobalConfig();
    const asked = [
      config.VISION_API_URL
        ? visionApi.get<Envelope<ActivityItem[]>>(`/public/activity?${query}`, { skipAuthRedirect: true })
        : undefined,
      config.DATASET_API_URL
        ? datasetApi.get<Envelope<ActivityItem[]>>(`/activity?${query}`, { skipAuthRedirect: true })
        : undefined
    ].filter((request): request is Promise<Envelope<ActivityItem[]>> => request !== undefined);
    const settled = await Promise.allSettled(asked);
    const failed = settled.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (failed.length > 0 && failed.length === settled.length) throw failed[0].reason;
    return settled
      .flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value.data : []))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, limit);
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
