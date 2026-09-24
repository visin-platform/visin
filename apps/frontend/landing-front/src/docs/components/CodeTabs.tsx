import { Children, Fragment, isValidElement, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import CopyButton from './CopyButton';
import type { CodeBlockProps } from './CodeBlock';
import { codeFrameSx, codeHeaderSx } from './codeFrame';
import { InCodeTabsContext, languageLabel, useCodeLanguage } from '../codeLanguage';

interface CodeTabsProps {
  /** Fenced code blocks, one per language. A block's `title` names its tab. */
  children: ReactNode;
}

/** The code blocks among the children. The build wraps each highlighted block in a fragment, so look inside those. */
function codeBlocksIn(children: ReactNode): ReactElement<CodeBlockProps>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    if (child.type === Fragment) return codeBlocksIn(child.props.children);
    return [child as ReactElement<CodeBlockProps>];
  });
}

/** The same example in several languages. The reader's pick holds on every page. */
export default function CodeTabs({ children }: CodeTabsProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const { language, setLanguage } = useCodeLanguage();

  const blocks = codeBlocksIn(children);
  const languages = blocks.map((block) => block.props['data-language'] ?? '');
  const selected = Math.max(0, languages.indexOf(language ?? ''));

  return (
    <Box sx={codeFrameSx}>
      <Box sx={{ ...codeHeaderSx, pl: 0.5 }}>
        <Tabs
          value={selected}
          onChange={(_, index: number) => setLanguage(languages[index])}
          aria-label="Code language"
          sx={{
            minHeight: 40,
            '& .MuiTabs-indicator': { bgcolor: 'primary.light' },
            '& .MuiTab-root': {
              minHeight: 40,
              minWidth: 0,
              px: 1.5,
              textTransform: 'none',
              fontFamily: 'inherit',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.64)'
            },
            '& .MuiTab-root.Mui-selected': { color: '#fff' }
          }}
        >
          {blocks.map((block, index) => (
            <Tab
              key={index}
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel`}
              label={block.props['data-title'] ?? languageLabel(block.props['data-language'])}
            />
          ))}
        </Tabs>
        <CopyButton target={panel} />
      </Box>
      <InCodeTabsContext.Provider value={true}>
        <div ref={panel} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`}>
          {blocks[selected]}
        </div>
      </InCodeTabsContext.Provider>
    </Box>
  );
}
