import { Box, Container, Typography } from '@mui/material';
import { SHOWCASE } from '../content';

/**
 * What a run leaves behind, shown rather than told: four real screens, a title
 * and one line each.
 */
export default function Showcase() {
  return (
    <Box component="section" id="product" aria-labelledby="product-title" sx={{ py: { xs: 9, md: 14 }, bgcolor: '#F6F7FB' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
            The product
          </Typography>
          <Typography id="product-title" variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.75rem' } }}>
            Everything a run records, in one place
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 5 } }}>
          {SHOWCASE.map((item) => (
            <Box component="figure" key={item.title} sx={{ m: 0 }}>
              <Box
                sx={{
                  bgcolor: '#fff',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '16px',
                  p: { xs: 1, md: 1.5 },
                  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
                  height: { xs: 220, md: 300 },
                  overflow: 'hidden'
                }}
              >
                <Box
                  component="img"
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  // Filled from the top left: a wide table then reads at a
                  // legible size, cropped at its right edge, instead of shrinking
                  // to a strip in the middle of the tile.
                  sx={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'left top',
                    borderRadius: '10px'
                  }}
                />
              </Box>
              <Box component="figcaption" sx={{ mt: 2, px: 0.5 }}>
                <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
                  {item.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary' }}>{item.caption}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
