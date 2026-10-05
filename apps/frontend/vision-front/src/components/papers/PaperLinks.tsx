import React from 'react';
import { Box, Button } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';

interface PaperLinksProps {
  arxivId?: string;
  doi?: string;
  url?: string;
  pdfUrl?: string;
}

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Where the paper itself lives: arXiv, the publisher by DOI, a PDF, a page. Opens in a new tab, outside Visin. */
const PaperLinks: React.FC<PaperLinksProps> = ({ arxivId, doi, url, pdfUrl }) => {
  const links = [
    arxivId && { label: `arXiv:${arxivId}`, href: `https://arxiv.org/abs/${arxivId}` },
    doi && { label: `DOI ${doi}`, href: `https://doi.org/${doi}` },
    pdfUrl && { label: 'PDF', href: pdfUrl },
    url && { label: 'Paper page', href: url }
  ].filter((link): link is { label: string; href: string } => Boolean(link));
  if (links.length === 0) return null;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {links.map((link) => (
        <Button key={link.label} size="small" variant="outlined" href={link.href} endIcon={<OpenInNew fontSize="small" />} {...external}>
          {link.label}
        </Button>
      ))}
    </Box>
  );
};

export default PaperLinks;
