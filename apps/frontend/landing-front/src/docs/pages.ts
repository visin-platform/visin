import type { MDXContent } from 'mdx/types';
import Overview from './content/overview.mdx';
import Quickstart from './content/quickstart.mdx';
import Authentication from './content/authentication.mdx';
import SendingResults from './content/sending-results.mdx';
import TestResultsAndBenchmarks from './content/test-results-and-benchmarks.mdx';
import PredictionFrames from './content/prediction-frames.mdx';
import ErrorsAndLimits from './content/errors-and-limits.mdx';
import Assistants from './content/assistants.mdx';

export interface DocPage {
  /** The path under /docs; empty for the docs home. */
  slug: string;
  title: string;
  /** The line under the title, and the page's meta description. */
  description: string;
  Content: MDXContent;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

/** The sidebar, in reading order: the "next" link on each page follows it. */
export const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Get started',
    pages: [
      {
        slug: '',
        title: 'Integrate with Visin',
        description: 'Send training runs from your own scripts, read results back, and connect an assistant.',
        Content: Overview
      },
      {
        slug: 'quickstart',
        title: 'Quickstart',
        description: 'Send a training run from a script and see it charted. About ten minutes.',
        Content: Quickstart
      }
    ]
  },
  {
    title: 'Guides',
    pages: [
      {
        slug: 'authentication',
        title: 'Authentication',
        description: 'Which credential to use, what it can reach, and what the errors mean.',
        Content: Authentication
      },
      {
        slug: 'sending-results',
        title: 'Sending results',
        description: 'What an epoch can carry, which names the charts read, and what Visin finds by itself.',
        Content: SendingResults
      },
      {
        slug: 'test-results-and-benchmarks',
        title: 'Test results and benchmarks',
        description: 'Scores on held-out data by condition and class, and how fast a model runs.',
        Content: TestResultsAndBenchmarks
      },
      {
        slug: 'prediction-frames',
        title: 'Prediction frames',
        description: 'Store the images a run renders, and see them epoch by epoch.',
        Content: PredictionFrames
      },
      {
        slug: 'errors-and-limits',
        title: 'Errors, limits and pages',
        description: 'What a failed request answers, what to retry, how much you can send, and paging through lists.',
        Content: ErrorsAndLimits
      },
      {
        slug: 'assistants',
        title: 'Connecting an assistant',
        description: 'Let Claude or another MCP client read your runs, with only the access you choose.',
        Content: Assistants
      }
    ]
  }
];

/** Scalar's page, outside the guides' layout (see DocsApp). */
export const API_REFERENCE_PATH = '/docs/api';

/**
 * The specs the reference shows, bundled from the services by `npm run
 * openapi:bundle`. `apiUrl` names the config entry for the service's public
 * address, where "try it" sends requests; `basePath` is what its paths sit under.
 */
export const API_SPECS = [
  {
    slug: 'vision',
    title: 'Runs and results',
    url: '/openapi/vision.json',
    apiUrl: 'VISION_API_URL',
    basePath: '/api'
  },
  { slug: 'auth', title: 'API keys and OAuth', url: '/openapi/auth.json', apiUrl: 'AUTH_SERVICE_URL', basePath: '' }
] as const;

export const DOC_PAGES = DOC_SECTIONS.flatMap((section) => section.pages);

export const docPath = (page: DocPage) => (page.slug ? `/docs/${page.slug}` : '/docs');

/** Where a page's Markdown lives in the repository, for "Edit this page". */
export const docSource = (page: DocPage) =>
  `apps/frontend/landing-front/src/docs/content/${page.slug || 'overview'}.mdx`;

export const findDocPage = (slug: string) => DOC_PAGES.find((page) => page.slug === slug);

export const sectionOf = (page: DocPage) => DOC_SECTIONS.find((section) => section.pages.includes(page));
