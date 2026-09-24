import type { ComponentProps } from 'react';
import { Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * A link in the docs. Another docs page opens in place; the landing page, the
 * app and anything off-site load normally, and off-site ones in a new tab.
 */
export default function DocLink({ href = '', children, ...rest }: ComponentProps<'a'>) {
  // The API reference is left out: it loads by itself, with its own styles.
  if (href.startsWith('/docs') && !href.startsWith('/docs/api')) {
    return (
      <Link component={RouterLink} to={href} {...rest}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//.test(href);
  return (
    <Link href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {children}
    </Link>
  );
}
