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
  /** Key into the icon map in Workflow.tsx. */
  icon: 'upload' | 'label' | 'train' | 'compare' | 'write';
  title: string;
  body: string;
}

/**
 * The pipeline, as a flow.
 *
 * A line each, because the point of the diagram is the shape of the path — raw
 * images in one end, a paper table out the other. A sentence per node stops it
 * being a diagram and makes it a list with decoration.
 */
export const STEPS: Step[] = [
  { icon: 'upload', title: 'Upload', body: 'Images and metadata. Private unless you say so.' },
  { icon: 'label', title: 'Label', body: 'Split the job across your team.' },
  { icon: 'train', title: 'Train', body: 'Your script posts epochs and renders.' },
  { icon: 'compare', title: 'Compare', body: 'Runs side by side, at their best epoch.' },
  { icon: 'write', title: 'Write up', body: 'Claude drafts the paper section.' }
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
}

export const ASK_CONVERSATION: ChatTurn[] = [
  { from: 'you', text: 'Which of the window ablations won?' },
  {
    from: 'visin',
    text: 'window16, by 0.004 mIoU — 0.451 at epoch 185 against 0.447 at 195. Neither ended at its best; both are past their peak well before epoch 200.',
    via: 'read 2 runs, 400 epochs'
  },
  { from: 'you', text: 'Is that gap real?' },
  {
    from: 'visin',
    text: 'One seed each, so I would not report it as one. Validation loss bottoms out around epoch 13 and roughly quadruples by the end — both runs overfit long before they stop.',
    via: 'read the epoch curves'
  },
  { from: 'you', text: 'What should I change for the next run?' },
  {
    from: 'visin',
    text: 'Stop around epoch 30, where validation loss turns. window16 is 15% slower per frame for that 0.004, so keep window8 as the baseline and rerun both on three seeds.',
    via: 'read the config both runs launched with'
  },
  { from: 'you', text: 'Write it up.' },
  {
    from: 'visin',
    text: 'Saved to the project, and here it is as a section. The table is built from the recorded epochs, not retyped.',
    via: 'exported as LaTeX',
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
