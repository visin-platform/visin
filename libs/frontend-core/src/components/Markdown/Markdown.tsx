import { Fragment, useMemo, type ReactNode } from 'react';
import { Box, Link, Typography } from '@mui/material';
import { parseBlocks, type Align, type Block, type Inline } from './parse';

/** More than a readme needs: the rest is not shown, so one cannot make every visitor's browser work on a book. */
export const MAX_MARKDOWN_LENGTH = 20_000;

const external = (href: string): boolean => /^(https?:|mailto:)/i.test(href);

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'code':
        return (
          <Box key={index} component="code" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}>
            {node.text}
          </Box>
        );
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'del':
        return <del key={index}>{renderInline(node.children)}</del>;
      case 'br':
        return <br key={index} />;
      case 'link':
        // Written by a stranger and read by everyone: no referrer, no endorsement, and `javascript:` never gets here.
        return node.href ? (
          <Link
            key={index}
            href={node.href}
            {...(external(node.href) ? { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } : {})}
          >
            {renderInline(node.children)}
          </Link>
        ) : (
          <Fragment key={index}>{renderInline(node.children)}</Fragment>
        );
      case 'image':
        // Never loaded: it would tell its author who read this, and from where. The reader gets the words, and a link.
        return node.href ? (
          <Link key={index} href={node.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            {node.alt || node.href} (image)
          </Link>
        ) : (
          <Fragment key={index}>{node.alt}</Fragment>
        );
    }
  });
}

const alignOf = (align: Align) => (align ? { textAlign: align } : {});

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      // The page has its own title, so `#` is the page's second level.
      const level = Math.min(block.level + 1, 6);
      return (
        <Typography
          key={index}
          component={`h${level}` as 'h2'}
          sx={{ fontSize: ['1.5rem', '1.3rem', '1.15rem', '1.05rem', '1rem'][level - 2], fontWeight: 700, lineHeight: 1.3, mt: 3, mb: 1 }}
        >
          {renderInline(block.children)}
        </Typography>
      );
    }
    case 'paragraph':
      return (
        <Typography key={index} sx={{ my: 1.5, overflowWrap: 'anywhere' }}>
          {renderInline(block.children)}
        </Typography>
      );
    case 'code':
      return (
        <Box
          key={index}
          component="pre"
          tabIndex={0}
          sx={{ my: 1.5, p: 1.5, overflowX: 'auto', borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.875rem', lineHeight: 1.5 }}
        >
          <code>{block.text}</code>
        </Box>
      );
    case 'quote':
      return (
        <Box key={index} component="blockquote" sx={{ my: 1.5, mx: 0, pl: 2, borderLeft: 3, borderColor: 'divider', color: 'text.secondary' }}>
          {block.children.map(renderBlock)}
        </Box>
      );
    case 'hr':
      return <Box key={index} component="hr" sx={{ my: 3, border: 0, borderTop: 1, borderColor: 'divider' }} />;
    case 'list':
      return (
        <Box key={index} component={block.ordered ? 'ol' : 'ul'} start={block.ordered ? block.start : undefined} sx={{ my: 1.5, pl: 3 }}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item.map(renderBlock)}</li>
          ))}
        </Box>
      );
    case 'table':
      return (
        <Box key={index} sx={{ my: 1.5, overflowX: 'auto' }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '50%', '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 0.75 }, '& th': { bgcolor: 'action.hover', fontWeight: 700 } }}>
            <thead>
              <tr>
                {block.head.map((cell, column) => (
                  <th key={column} scope="col" style={alignOf(block.align[column])}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column} style={alignOf(block.align[column])}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      );
  }
}

/**
 * Text written in Markdown, shown safely. For what other people write (a project's readme): it renders to React
 * elements, never to HTML, so nothing in it can run, raw HTML is shown as the text it is, images are not loaded,
 * and a link must be http(s), mailto, an in-page anchor or an app path. See `parse.ts`.
 */
export function Markdown({ children }: { children: string }) {
  const blocks = useMemo(() => parseBlocks(children.slice(0, MAX_MARKDOWN_LENGTH)), [children]);
  return <Box sx={{ minWidth: 0, '& > :first-child': { mt: 0 }, '& > :last-child': { mb: 0 } }}>{blocks.map(renderBlock)}</Box>;
}
