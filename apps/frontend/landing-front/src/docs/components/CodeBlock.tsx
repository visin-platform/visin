import { useContext, useRef, type ComponentProps } from 'react';
import { Box } from '@mui/material';
import CopyButton from './CopyButton';
import { codeFrameSx, codeHeaderSx, codePreSx } from './codeFrame';
import { InCodeBlockContext, InCodeTabsContext, languageLabel } from '../codeLanguage';

/** A fenced block as Shiki left it, with the attributes the build adds (see vite.config.ts). */
export type CodeBlockProps = ComponentProps<'pre'> & {
  'data-language'?: string;
  'data-title'?: string;
};

/** A fenced code block: labelled, scrollable, and one click to copy. */
export default function CodeBlock({
  children,
  // Shiki's own background and class give way to the ink panel.
  style: _style,
  className: _className,
  'data-language': language,
  'data-title': title,
  ...rest
}: CodeBlockProps) {
  const inTabs = useContext(InCodeTabsContext);
  const ref = useRef<HTMLPreElement>(null);

  const pre = (
    <InCodeBlockContext.Provider value={true}>
      {/* Focusable, so a keyboard user can scroll a long line. */}
      <Box component="pre" ref={ref} tabIndex={0} sx={codePreSx} {...rest}>
        {children}
      </Box>
    </InCodeBlockContext.Provider>
  );

  if (inTabs) return pre;

  return (
    <Box sx={codeFrameSx}>
      <Box sx={codeHeaderSx}>
        <span>{title ?? languageLabel(language)}</span>
        <CopyButton target={ref} />
      </Box>
      {pre}
    </Box>
  );
}
