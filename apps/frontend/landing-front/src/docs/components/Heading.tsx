import type { ReactNode } from 'react';
import { Link, Typography } from '@mui/material';
import { slugify, textOf } from '../slug';

interface HeadingProps {
  children?: ReactNode;
}

const SIZES = { 2: { fontSize: '1.6rem', mt: 7 }, 3: { fontSize: '1.2rem', mt: 5 } } as const;

function Heading({ level, children }: HeadingProps & { level: 2 | 3 }) {
  const text = textOf(children);
  const id = slugify(text);

  return (
    <Typography
      component={`h${level}`}
      id={id}
      data-outline={text}
      sx={{
        ...SIZES[level],
        mb: 2,
        fontWeight: 700,
        letterSpacing: level === 2 ? '-0.5px' : 0,
        lineHeight: 1.3,
        scrollMarginTop: 88,
        '&:hover .heading-anchor': { opacity: 1 }
      }}
    >
      {children}
      <Link
        href={`#${id}`}
        className="heading-anchor"
        aria-label={`Link to “${text}”`}
        underline="none"
        sx={{ ml: 1, opacity: 0, color: 'text.disabled', '&:focus-visible': { opacity: 1 } }}
      >
        #
      </Link>
    </Typography>
  );
}

/** Sections of a page. Each gets an anchor and a line in "On this page". */
export function H2(props: HeadingProps) {
  return <Heading level={2} {...props} />;
}

export function H3(props: HeadingProps) {
  return <Heading level={3} {...props} />;
}
