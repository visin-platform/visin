import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';
import { Article, Brush, CloudUpload, CompareArrows, ModelTraining } from '@mui/icons-material';
import { STEPS, type Step } from '../content';

const ICONS: Record<Step['icon'], ReactNode> = {
  upload: <CloudUpload />,
  label: <Brush />,
  train: <ModelTraining />,
  compare: <CompareArrows />,
  write: <Article />
};

/** Where the icon sits, and so where the track has to be drawn to meet it. */
const NODE = 52;

/**
 * The pipeline as a flow rather than five cards.
 *
 * The heading promises a path from raw images to a table in a paper, and a row
 * of equal cards does not show a path — it shows five unrelated things. A track
 * running through the nodes says the order matters and that the last one is
 * what the first four are for, which is the actual claim.
 *
 * The last node is filled rather than outlined for the same reason: it is the
 * payoff the heading names, not just the fifth of five.
 *
 * Horizontal on a wide screen and vertical on a narrow one, because a five-node
 * flow squeezed into a phone width stops being legible as a flow at all. The
 * track is a real element rather than a pseudo-element so its orientation can
 * change with the breakpoint.
 */
export default function Workflow() {
  return (
    <Box component="section" id="how-it-works" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 680, mb: { xs: 5, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
            How it works
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
            From raw images to a table in your paper
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem' }}>
            Start wherever you like. Nothing makes you use the whole thing.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
          {STEPS.map((step, index) => {
            const last = index === STEPS.length - 1;

            return (
              <Box
                key={step.title}
                sx={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  flexDirection: { xs: 'row', md: 'column' },
                  alignItems: { xs: 'flex-start', md: 'center' },
                  textAlign: { xs: 'left', md: 'center' },
                  gap: { xs: 2.5, md: 0 },
                  px: { md: 1.5 },
                  pb: { xs: last ? 0 : 4, md: 0 }
                }}
              >
                {!last && (
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      bgcolor: 'divider',
                      // Down the left rail on a phone; through the node centres
                      // on a wide screen, where `left: 50%` plus a full width
                      // reaches exactly the next node's centre.
                      left: { xs: NODE / 2 - 1, md: '50%' },
                      top: { xs: NODE, md: NODE / 2 - 1 },
                      width: { xs: 2, md: '100%' },
                      height: { xs: `calc(100% - ${NODE}px)`, md: 2 }
                    }}
                  />
                )}

                <Box
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    width: NODE,
                    height: NODE,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    mb: { md: 2 },
                    // Opaque so the track passes behind the node, not through it.
                    bgcolor: last ? 'primary.main' : 'background.paper',
                    color: last ? '#fff' : 'primary.main',
                    border: '2px solid',
                    borderColor: last ? 'primary.main' : 'divider',
                    boxShadow: last ? '0 8px 24px rgba(37,99,235,0.28)' : 'none',
                    '& svg': { fontSize: 24 }
                  }}
                >
                  {ICONS[step.icon]}
                </Box>

                <Box sx={{ minWidth: 0, pt: { xs: 1, md: 0 } }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 0.5 }}>
                    {step.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.925rem', lineHeight: 1.6 }}>
                    {step.body}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
