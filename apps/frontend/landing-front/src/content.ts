/**
 * Landing copy lives here so every claim is in one place and can be checked
 * against what the platform actually does. Nothing here describes a capability
 * the services don't implement.
 *
 * Kept short on purpose. A visitor scans; they do not read. Anything that needs
 * a paragraph to explain belongs in the docs, not on the way in.
 */

export const GITHUB_URL = 'https://github.com/visin-platform';

export interface Step {
  title: string;
  body: string;
}

export const STEPS: Step[] = [
  { title: 'Organise', body: 'Datasets, projects, categories. Private unless you say otherwise.' },
  { title: 'Label', body: 'Hand a bundle to your team and watch the progress.' },
  { title: 'Train', body: 'Your script posts epochs, configs and renders as it goes.' },
  { title: 'Compare', body: 'Runs side by side. Export the table as LaTeX.' },
  { title: 'Ask', body: 'Connect Claude. It reads the runs and writes down what it finds.' }
];

export interface Feature {
  /** Key into the icon map in Features.tsx. */
  icon: 'datasets' | 'labeling' | 'training' | 'compare' | 'teams' | 'api' | 'assistant';
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'assistant',
    title: 'An assistant that reads the record',
    body: 'Claude connects over MCP and pulls the runs, curves, per-class scores and benchmarks itself. It opens the rendered frames and looks at them, then writes its conclusion onto the project.'
  },
  {
    icon: 'training',
    title: 'Runs & epochs',
    body: 'Config, per-epoch metrics and renders, kept with the run. Curves plot themselves.'
  },
  {
    icon: 'compare',
    title: 'Comparisons',
    body: 'Pick several runs, datasets or benchmarks. One table, exportable as LaTeX or CSV.'
  },
  {
    icon: 'datasets',
    title: 'Datasets & projects',
    body: 'Images, categories, metadata. Public to everyone or private to your group.'
  },
  {
    icon: 'labeling',
    title: 'Labeling',
    body: 'Upload a zip, split the job across your team, track it per worker.'
  },
  {
    icon: 'api',
    title: 'Tokens for scripts',
    body: 'Scoped to one project. A CI job cannot touch anything else.'
  }
];

export interface OpenSourcePoint {
  title: string;
  body: string;
}

export const OPEN_SOURCE_POINTS: OpenSourcePoint[] = [
  {
    title: 'Runs on your hardware',
    body: 'Node services, React apps, MongoDB. Each ships a Dockerfile. Run the lot or two parts.'
  },
  {
    title: 'Your images stay yours',
    body: 'Files sit on disk, on machines you control. No third party. No hosted tier to leave later.'
  },
  {
    title: 'MIT licensed',
    body: 'No seats. No quota. No licence key.'
  }
];

/**
 * The MCP section.
 *
 * Every example is a question the shipped tools can actually answer, and every
 * limit named is a real one. Someone who connects an assistant expecting to
 * show it a dataset image finds out here rather than after wiring it up.
 */
export const MCP_ENDPOINT = 'https://mcp.visin.eu/mcp';

export interface AskExample {
  question: string;
  /** what the assistant reaches for — named so the claim stays checkable */
  via: string;
}

export const ASK_EXAMPLES: AskExample[] = [
  {
    question: '"Has the loss plateaued, or is it still coming down?"',
    via: 'reads the epoch curve'
  },
  {
    question: '"Of these three, which is best and what did each cost?"',
    via: 'epochs, GPU hours, final metrics and benchmarks, side by side'
  },
  {
    question: '"Show me where the night model gets it wrong."',
    via: 'opens the rendered frames and looks at the predictions'
  },
  {
    question: '"Write up what the window ablation shows."',
    via: 'saves it on the project, citing the runs behind it'
  }
];

export interface ConnectStep {
  title: string;
  body: string;
}

export const CONNECT_STEPS: ConnectStep[] = [
  {
    title: 'One click, no key',
    body: 'Point your assistant at the endpoint, tick what it may do, done. Read-only unless you say otherwise.'
  },
  {
    title: 'Reading and writing are separate',
    body: 'An assistant that writes up results does not need to rename anything. So do not grant it.'
  },
  {
    title: 'You see what it did',
    body: 'Every call logged: which tool, how long, how many tokens, whether it failed.'
  }
];

export interface AssistantLimit {
  body: string;
}

export const ASSISTANT_LIMITS: AssistantLimit[] = [
  { body: 'It reads measurements. It does not make them.' },
  { body: 'It sees the frames a run rendered. Not your raw dataset images.' },
  { body: 'It reaches exactly what your account reaches, and nothing else.' }
];
