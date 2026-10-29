import { Training } from '../../types';

/** A run of consecutive rows, headed by its project when the list is grouped. */
export interface RunSection {
  key: string;
  /** The project's name; absent for a flat list. */
  name?: string;
  projectId?: string;
  runs: Training[];
}

const NO_PROJECT = '__none__';

/**
 * Groups one page of runs under their projects, the project with the most
 * recent run first and each project's runs in the order they came, so a feed
 * of recent work reads by project rather than interleaved.
 */
export const groupRuns = (trainings: Training[], projectNames: Record<string, string>): RunSection[] => {
  const sections = new Map<string, RunSection>();
  for (const training of trainings) {
    const key = training.projectId ?? NO_PROJECT;
    const section = sections.get(key) ?? {
      key,
      projectId: training.projectId,
      name: training.projectId ? (projectNames[training.projectId] ?? 'Unknown project') : 'No project',
      runs: []
    };
    section.runs.push(training);
    sections.set(key, section);
  }
  return [...sections.values()];
};
