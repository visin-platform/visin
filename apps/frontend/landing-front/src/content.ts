/**
 * Landing copy lives here so every claim is in one place and can be checked
 * against what the platform actually does. Nothing here describes a capability
 * the services don't implement.
 *
 * Kept short on purpose. A visitor scans; they do not read. Anything that needs
 * a paragraph to explain belongs in the docs, not on the way in.
 */

export const GITHUB_URL = 'https://github.com/visin-platform/visin';

/**
 * The quickstart shown in the terminal block, byte-for-byte the same three
 * commands as the README. Docker is the only prerequisite: every secret has a
 * development default, so a fresh clone boots with no configuration. Built from
 * GITHUB_URL so the clone line cannot drift from the link beside it.
 */
export const QUICKSTART = [`git clone ${GITHUB_URL}`, 'cd visin', 'docker compose up -d'];

/**
 * Real screens of the product, captured from a running instance: the page
 * shows what Visin looks like rather than describing it. Metrics and run names
 * only — no dataset imagery (third-party licences) and no other people's
 * account details.
 */
export interface ShowcaseItem {
  src: string;
  alt: string;
  title: string;
  caption: string;
}

export const SHOWCASE: ShowcaseItem[] = [
  {
    src: '/showcase/charts.webp',
    alt: 'Training and validation loss and mean IoU curves over 100 epochs',
    title: 'Every epoch, charted',
    caption: 'Loss and metric curves for each run, as your script posts them.'
  },
  {
    src: '/showcase/compare.webp',
    alt: 'A table comparing nine runs by time, best epoch and best validation mIoU',
    title: 'Runs compared at their best',
    caption: 'Side by side at the best epoch, not the last one.'
  },
  {
    src: '/showcase/tests.webp',
    alt: 'Per-class IoU, precision, recall and AP for each weather condition',
    title: 'Per class, per condition',
    caption: 'Test scores broken down the way your data is.'
  },
  {
    src: '/showcase/label.webp',
    alt: 'A labeling job at 1,002 of 4,110 frames, with start labeling and browse buttons',
    title: 'Labeling as a team',
    caption: 'Split a job across your group and watch it fill up.'
  }
];

/** The installed app on a phone: the same data, in your pocket. */
export const PHONE_SCREENS = [
  { src: '/showcase/phone-home.webp', alt: 'Visin home on a phone: projects, trainings and tasks to label' },
  { src: '/showcase/phone-trainings.webp', alt: 'A project’s training runs listed on a phone' },
  { src: '/showcase/phone-charts.webp', alt: 'A run’s loss curve on a phone' }
];

export interface OpenSourcePoint {
  title: string;
  body: string;
}

export const OPEN_SOURCE_POINTS: OpenSourcePoint[] = [
  { title: 'Runs on your hardware', body: 'One Docker Compose file.' },
  { title: 'Your images stay yours', body: 'On disk, on machines you control.' },
  { title: 'MIT licensed', body: 'No seats, no quota, no licence key.' }
];

/**
 * The MCP section.
 *
 * Every example is a question the shipped tools can actually answer, and every
 * limit named is a real one. Someone who connects an assistant expecting to
 * show it a dataset image finds out here rather than after wiring it up.
 *
 * The endpoint itself is not here: it is this deployment's own MCP server
 * (`MCP_PUBLIC_URL`), read from config by the section that shows it.
 */

/**
 * One exchange in the sample conversation.
 *
 * A transcript rather than a list of questions because the questions were never
 * the interesting part — what the thing answers with is. It reads as one
 * session, not four disconnected prompts, since that is how the work actually
 * goes: ask, doubt the answer, decide what to run next, write it up.
 *
 * The numbers are illustrative. They are shaped like real ablation output and
 * the behaviour they describe is real, but no unpublished result belongs on a
 * public page.
 */
export interface ChatTurn {
  from: 'you' | 'visin';
  text: string;
  /** what it read to answer, shown under the reply the way a tool call would be */
  via?: string;
  /** something it produced, shown as code */
  code?: string;
  /**
   * The MCP tools it calls first, by their real names, played as calls that
   * run and complete before the answer arrives.
   */
  tools?: string[];
  /** Draw the two runs' validation curves under the answer. */
  chart?: boolean;
}

export const ASK_CONVERSATION: ChatTurn[] = [
  { from: 'you', text: 'Which of the window ablations won?' },
  {
    from: 'visin',
    text: 'window16, by 0.004 mIoU — 0.451 at epoch 185 against 0.447 at 195. Neither ended at its best; both are past their peak well before epoch 200.',
    via: 'read 2 runs, 400 epochs',
    tools: ['list_trainings', 'compare_trainings', 'get_training_curve'],
    chart: true
  },
  { from: 'you', text: 'Write it up.' },
  {
    from: 'visin',
    text: 'Saved to the project, and here it is as a section. The table is built from the recorded epochs, not retyped.',
    via: 'exported as LaTeX',
    tools: ['record_finding'],
    code: [
      '\\subsection{Window size past 16}',
      '\\begin{table}[htbp]',
      '\\toprule',
      'Run & Epoch & val.mean\\_iou \\\\',
      '\\midrule',
      'window16 & 185 & 0.4510 \\\\'
    ].join('\n')
  }
];

export interface ConnectStep {
  title: string;
  body: string;
}

export const CONNECT_STEPS: ConnectStep[] = [
  { title: 'One click, no key', body: 'Claude, ChatGPT, anything that speaks MCP.' },
  { title: 'Read-only by default', body: 'Writing is a separate permission.' },
  { title: 'Every call logged', body: 'Which tool, how long, how many tokens.' }
];

export interface AssistantLimit {
  body: string;
}

export const ASSISTANT_LIMITS: AssistantLimit[] = [
  { body: 'It reads measurements. It does not make them.' },
  { body: 'It sees rendered frames, not your raw dataset images.' },
  { body: 'It reaches what your account reaches, nothing more.' }
];
