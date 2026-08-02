/**
 * Landing copy lives here so every claim is in one place and can be checked
 * against what the platform actually does. Nothing here describes a capability
 * the services don't implement.
 */

export const GITHUB_URL = 'https://github.com/visin-platform';

export interface Step {
  title: string;
  body: string;
}

export const STEPS: Step[] = [
  {
    title: 'Organise',
    body: 'Group images into datasets and projects, with categories and per-image metadata. Projects are private by default, or public when you want to share results.'
  },
  {
    title: 'Label',
    body: 'Bundle images into labeling jobs and hand them to your team. Workers mark good and bad frames and toggle masks; admins track progress per job.'
  },
  {
    title: 'Train & record',
    body: 'Push training runs, per-epoch metrics, configs, and visualisations from your own scripts through a project-scoped API token.'
  },
  {
    title: 'Compare & publish',
    body: 'Put runs, datasets, test results, and benchmarks side by side, then export the comparison as LaTeX or CSV for your paper.'
  }
];

export interface Feature {
  /** Key into the icon map in Features.tsx. */
  icon: 'datasets' | 'labeling' | 'training' | 'compare' | 'teams' | 'api';
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'datasets',
    title: 'Datasets & projects',
    body: 'Upload images, sort them into categories, and keep every experiment attached to the project it belongs to. Public projects are readable by anyone; private ones stay with your group.'
  },
  {
    icon: 'labeling',
    title: 'Collaborative labeling',
    body: 'A dedicated labeling app: upload a zip bundle, create a job, and split the work across your team. Full-frame mask toggling and good/bad review, with per-worker progress.'
  },
  {
    icon: 'training',
    title: 'Training runs & epochs',
    body: 'Record runs with their configs, per-epoch metrics, and generated visualisations. Chart accuracy and loss across epochs without wiring up a spreadsheet.'
  },
  {
    icon: 'compare',
    title: 'Comparisons & benchmarks',
    body: 'Line up several trainings, datasets, test results, or benchmark runs in one view — then export the table as LaTeX or CSV and paste it straight into a paper.'
  },
  {
    icon: 'teams',
    title: 'Groups & roles',
    body: 'Invite people to a group as owner, admin, or member. Membership drives who can administer labeling jobs and who can see private work.'
  },
  {
    icon: 'api',
    title: 'API tokens for your scripts',
    body: 'Issue a project-scoped token and post results from a training loop or CI job. The token can only touch the project it was issued for.'
  }
];

export interface OpenSourcePoint {
  title: string;
  body: string;
}

export const OPEN_SOURCE_POINTS: OpenSourcePoint[] = [
  {
    title: 'Runs on your hardware',
    body: 'Five small Node services, five React apps, and MongoDB. Each ships its own Dockerfile and compose file, so you can run the lot or just the parts you need.'
  },
  {
    title: 'Your images stay yours',
    body: 'Files are stored on disk by the file service on machines you control. Nothing is sent to a third party, and there is no hosted tier to migrate off later.'
  },
  {
    title: 'MIT licensed',
    body: 'Read it, fork it, run it in a lab or a company. No seats, no quota, no licence key.'
  }
];
