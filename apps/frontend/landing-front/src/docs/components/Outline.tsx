import { useEffect, useState } from 'react';
import { Box, Link, Typography } from '@mui/material';

interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

interface OutlineProps {
  /** Changes with the page, which is when the headings are read again. */
  pageKey: string;
}

/** "On this page": the page's sections, with the one being read marked. */
export default function Outline({ pageKey }: OutlineProps) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = [...document.querySelectorAll<HTMLElement>('article [data-outline]')];
    setItems(
      headings.map((heading) => ({
        id: heading.id,
        // The selector only matches headings that carry it.
        text: heading.dataset.outline!,
        level: heading.tagName === 'H3' ? 3 : 2
      }))
    );
    setActive(null);
    if (!('IntersectionObserver' in window)) return;

    // A heading counts as current once it passes the top fifth of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const entering = entries.find((entry) => entry.isIntersecting);
        if (entering) setActive(entering.target.id);
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [pageKey]);

  if (items.length === 0) return null;

  return (
    <Box component="nav" aria-label="On this page" sx={{ display: { xs: 'none', lg: 'block' } }}>
      <Box sx={{ position: 'sticky', top: 88 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}>
          On this page
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
          {items.map((item) => (
            <Box component="li" key={item.id} sx={{ pl: item.level === 3 ? 1.5 : 0 }}>
              <Link
                href={`#${item.id}`}
                aria-current={active === item.id ? 'location' : undefined}
                underline="none"
                sx={{
                  display: 'block',
                  py: 0.5,
                  fontSize: '0.85rem',
                  color: 'text.secondary',
                  '&[aria-current="location"]': { color: 'primary.main', fontWeight: 600 },
                  '&:hover': { color: 'text.primary' }
                }}
              >
                {item.text}
              </Link>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
