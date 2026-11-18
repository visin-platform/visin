/** The tabs of a run's page, by the name `?tab=` takes. */
export const TRAINING_TABS = [
  ['overview', 'Overview'],
  // An inference run's recorded decisions; a training run has none and does not show the tab.
  ['samples', 'Samples'],
  // An inference run's decisions against the human audit of them.
  ['audit', 'Audit'],
  ['epochs', 'Epochs'],
  ['evaluations', 'Evaluations'],
  ['visualizations', 'Visualizations'],
  ['models', 'Models'],
  ['system-info', 'System Info'],
  ['config', 'Config'],
  ['benchmarks', 'Benchmarks'],
  ['analysis', 'Analysis']
] as const;

export type TrainingTab = (typeof TRAINING_TABS)[number][0];
