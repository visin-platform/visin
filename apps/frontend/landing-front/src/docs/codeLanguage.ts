import { createContext, useContext } from 'react';

/**
 * The language a reader picked in one set of code tabs, applied to every set
 * on every page and remembered between visits: someone who reads Python once
 * should not have to pick it again on the next example.
 */
export interface CodeLanguage {
  language: string | null;
  setLanguage: (language: string) => void;
}

export const CODE_LANGUAGE_KEY = 'visin-docs-language';

export const CodeLanguageContext = createContext<CodeLanguage>({ language: null, setLanguage: () => {} });

export const useCodeLanguage = () => useContext(CodeLanguageContext);

const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  bash: 'Shell',
  sh: 'Shell',
  js: 'JavaScript',
  ts: 'TypeScript',
  json: 'JSON',
  yaml: 'YAML',
  http: 'HTTP'
};

/** What a code block's header or tab calls its language. */
export const languageLabel = (language?: string) => (language && LANGUAGE_LABELS[language]) || language || 'Code';

/** Set by CodeTabs, so a block inside it leaves the header to the tabs. */
export const InCodeTabsContext = createContext(false);

/** Set by CodeBlock, so `code` inside it is not styled as inline code. */
export const InCodeBlockContext = createContext(false);
