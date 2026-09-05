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
  },
  {
    title: 'Ask',
    body: 'Connect an AI assistant over MCP and ask about your runs in plain language — which epoch was best, what changed between two experiments, how big the model is.'
  }
];

export interface Feature {
  /** Key into the icon map in Features.tsx. */
  icon: 'datasets' | 'labeling' | 'training' | 'compare' | 'teams' | 'api' | 'assistant';
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
    icon: 'assistant',
    title: 'Ask an assistant',
    body: 'Visin runs an MCP server, so Claude — or any client that speaks the protocol — can read your projects, runs, curves, and benchmarks and answer questions about them. Connect it in a click; it sees only what you can see.'
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

/**
 * The MCP section.
 *
 * Every example below is a question the shipped tools can actually answer, and
 * every limit named is a real one. The section says what the assistant cannot
 * do as plainly as what it can: someone who connects it expecting to show it an
 * image finds out here rather than after wiring it up.
 */
export const MCP_ENDPOINT = 'https://mcp.visin.eu/mcp';

export interface AskExample {
  question: string;
  /** what the assistant reaches for — named so the claim stays checkable */
  via: string;
}

export const ASK_EXAMPLES: AskExample[] = [
  {
    question: '"Did the loss on the CLFTv2 run plateau, or is it still coming down?"',
    via: 'reads the epoch curve, sampled down so a 300-epoch run stays readable'
  },
  {
    question: '"Which of these three runs is best, and what did each cost to train?"',
    via: 'compares runs side by side — epochs, GPU hours, final metrics, benchmarks'
  },
  {
    question: '"Which classes is the night-time model worst at?"',
    via: 'reads per-class IoU, precision, recall, F1 and AP from the test results'
  },
  {
    question: '"How fast is this model, and will it fit on the box we have?"',
    via: 'reads the benchmark: parameters, FLOPs, frames per second, peak GPU memory'
  }
];

export interface ConnectStep {
  title: string;
  body: string;
}

export const CONNECT_STEPS: ConnectStep[] = [
  {
    title: 'One click, no key',
    body: 'Point your assistant at the MCP endpoint and it walks you through a consent screen. Tick the permissions it gets — read-only by default — and it is connected. Disconnect it from your account page whenever you like.'
  },
  {
    title: 'Or paste a key',
    body: 'For a script, a CI job, or a client without OAuth: issue an API key from your account page, scoped to reading or writing, and send it as a bearer token.'
  },
  {
    title: 'You can see what it did',
    body: 'Every tool call is recorded with what it cost — which tool, how long, how many tokens came back, and whether it failed. Your account page shows the totals per tool.'
  }
];

export interface AssistantLimit {
  body: string;
}

export const ASSISTANT_LIMITS: AssistantLimit[] = [
  { body: 'It reads measurements; it does not make them. Epochs, test results, and benchmarks still come from your training pipeline.' },
  { body: 'It cannot look at an image. Datasets and visualisations are files; the tools return text.' },
  { body: 'It reaches only what your account already reaches. A private project belonging to someone else stays invisible to it.' }
];
