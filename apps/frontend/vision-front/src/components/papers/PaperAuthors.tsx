import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link, Tooltip, Typography } from '@mui/material';
import { useEmbedded } from '../../federation/EmbeddedContext';
import type { PaperAuthor } from '../../types/paper';
import { profileUrl } from '../../utils/profileLinks';

/**
 * A confirmed author is shown as a link to their Visin page, in the accent colour, so it is plain at a glance who on
 * the list is on Visin. Inside the shell that page is a route; standalone it is the shell's address, where one is
 * configured, and a bare name where it is not.
 */
const AuthorName: React.FC<{ author: PaperAuthor; embedded: boolean }> = ({ author, embedded }) => {
  const handle = author.status === 'confirmed' ? author.user?.handle : undefined;
  const href = handle && !embedded ? profileUrl(handle) : undefined;
  if (!handle || (!embedded && !href)) return <>{author.name}</>;
  const link = embedded ? { component: RouterLink, to: `/u/${handle}` } : { href };
  return (
    <Tooltip describeChild title={`@${handle} on Visin`}>
      <Link {...link} underline="hover" sx={{ fontWeight: 600 }}>
        {author.name}
      </Link>
    </Tooltip>
  );
};

/**
 * A paper's author list, as the paper prints it. A name links to its Visin page only where that person confirmed
 * it, and one who has not answered yet is marked, which only the paper's managers and that person are told about.
 */
const PaperAuthors: React.FC<{ authors: PaperAuthor[]; variant?: 'body1' | 'body2' }> = ({ authors, variant = 'body2' }) => {
  const embedded = useEmbedded();
  return (
    <Typography variant={variant} component="p" sx={{ color: 'text.secondary', m: 0 }}>
      {authors.map((author, index) => (
        <React.Fragment key={`${author.name}-${index}`}>
          {index > 0 && ', '}
          <AuthorName author={author} embedded={embedded} />
          {author.status === 'pending' && (
            <Tooltip title="Linked to a Visin account, which has not confirmed it yet">
              <span aria-label="not confirmed yet"> (unconfirmed)</span>
            </Tooltip>
          )}
        </React.Fragment>
      ))}
    </Typography>
  );
};

export default PaperAuthors;
