import type { MDXComponents } from 'mdx/types';
import CodeBlock from './components/CodeBlock';
import CodeTabs from './components/CodeTabs';
import InlineCode from './components/InlineCode';
import Callout from './components/Callout';
import McpEndpoint from './components/McpEndpoint';
import DocLink from './components/DocLink';
import DocTable from './components/DocTable';
import { H2, H3 } from './components/Heading';

/** What the Markdown in `content/` renders as, and the components its pages may use. */
export const mdxComponents: MDXComponents = {
  h2: H2,
  h3: H3,
  pre: CodeBlock,
  code: InlineCode,
  a: DocLink,
  table: DocTable,
  CodeTabs,
  Callout,
  McpEndpoint
};
