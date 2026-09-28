import { Box, Link, Typography } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';

interface DiagramProps {
  /** A file in public/architecture/, as `npm run diagrams` names it: `services.svg`. */
  name: string;
  /** What the diagram shows, for anyone who cannot see it. */
  alt: string;
  caption?: string;
}

/**
 * One of the architecture diagrams, at the column's width. On a phone that is
 * small, so the picture is also a link to itself at full size, where it can be
 * zoomed, saved, or pasted into slides.
 */
export default function Diagram({ name, alt, caption }: DiagramProps) {
  const src = `/architecture/${name}`;
  return (
    <Box component="figure" sx={{ my: 4, mx: 0 }}>
      <Link href={src} target="_blank" rel="noopener" sx={{ display: 'block' }}>
        <Box
          component="img"
          src={src}
          alt={alt}
          loading="lazy"
          sx={{
            display: 'block',
            width: '100%',
            height: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '12px'
          }}
        />
      </Link>
      <Box
        component="figcaption"
        sx={{ display: 'flex', gap: 2, alignItems: 'baseline', justifyContent: 'space-between', mt: 1 }}
      >
        <Typography component="span" sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
          {caption}
        </Typography>
        <Link
          href={src}
          target="_blank"
          rel="noopener"
          underline="hover"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, fontSize: '0.85rem' }}
        >
          Full size
          <OpenInNew sx={{ fontSize: 14 }} />
        </Link>
      </Box>
    </Box>
  );
}
