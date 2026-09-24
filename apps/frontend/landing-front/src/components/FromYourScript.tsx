import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Container, Grid, Stack, Typography, useMediaQuery } from '@mui/material';
import { ArrowForward, CheckCircleOutlined, Replay } from '@mui/icons-material';
import { chartSeries } from '@visin/frontend-core';
import { SCRIPT_DISCOVERED, SCRIPT_POINTS, SCRIPT_SNIPPET } from '../content';
import { INK, MONO } from '../theme';

const EPOCHS = 60;
const STEP_MS = 90;
const LINE = chartSeries.light[0];

/**
 * Illustrative curves, shaped like a segmentation run: a climb, a peak, and a
 * slow slide after it, so the best epoch is not the last one.
 */
const valMiou = (epoch: number) =>
  0.3 + 0.17 * (1 - Math.exp(-epoch / 11)) - Math.max(0, epoch - 42) * 0.0011 + Math.sin(epoch * 1.3) * 0.0025;
const trainLoss = (epoch: number) => 0.12 + 0.9 * Math.exp(-epoch / 9);

const Y_LOW = 0.28;
const Y_HIGH = 0.48;
const xOf = (epoch: number) => 30 + (epoch / EPOCHS) * 262;
const yOf = (value: number) => 96 - ((value - Y_LOW) / (Y_HIGH - Y_LOW)) * 88;
const AXIS = { fill: '#64748b', fontSize: 8, fontFamily: MONO };

const bestEpoch = Array.from({ length: EPOCHS + 1 }, (_, epoch) => epoch).reduce((best, epoch) =>
  valMiou(epoch) > valMiou(best) ? epoch : best
);

/**
 * The epochs arriving: what the loop on the left produces in the app, one post
 * at a time. Plays once when scrolled into view; someone who asked for less
 * motion, or a browser that cannot tell when it is visible, gets the finished run.
 */
function Arrivals() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canPlay = !reducedMotion && typeof window !== 'undefined' && 'IntersectionObserver' in window;
  const [epoch, setEpoch] = useState(canPlay ? 0 : EPOCHS);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canPlay || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [canPlay]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setEpoch((current) => Math.min(current + 1, EPOCHS)), STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (epoch >= EPOCHS) setPlaying(false);
  }, [epoch]);

  const done = epoch >= EPOCHS;
  const shown = Math.max(epoch, 1);
  const path = Array.from({ length: shown + 1 }, (_, e) => `${xOf(e).toFixed(1)},${yOf(valMiou(e)).toFixed(1)}`).join(' L');

  return (
    <Box
      ref={ref}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: '16px',
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 12px 32px -20px rgba(15,23,42,0.35)'
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700 }}>window16 ablation</Typography>
        <Chip
          size="small"
          color={done ? 'success' : 'info'}
          variant="outlined"
          label={done ? `Completed · ${EPOCHS} epochs` : `Running · epoch ${epoch}`}
          sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        />
      </Stack>

      <Stack direction="row" spacing={3} sx={{ mb: 1, fontFamily: MONO, fontSize: '0.8rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        <span>train.loss {trainLoss(epoch).toFixed(3)}</span>
        <span>
          {/* Ink, not the line's colour: that is too light for small text on white. */}
          val.mean_iou <Box component="strong" sx={{ color: 'text.primary' }}>{valMiou(epoch).toFixed(4)}</Box>
        </span>
      </Stack>

      <Box
        component="svg"
        viewBox="0 0 300 112"
        role="img"
        aria-label={`Validation mean IoU over ${EPOCHS} epochs, rising to ${valMiou(bestEpoch).toFixed(3)} at epoch ${bestEpoch}`}
        sx={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {[0.3, 0.35, 0.4, 0.45].map((value) => (
          <g key={value}>
            <line x1="30" x2="292" y1={yOf(value)} y2={yOf(value)} stroke="#e2e8f0" strokeWidth="1" />
            <text x="0" y={yOf(value) + 3} {...AXIS}>
              {value.toFixed(2)}
            </text>
          </g>
        ))}
        {[0, 30, 60].map((e) => (
          <text key={e} x={xOf(e)} y="110" textAnchor={e === 0 ? 'start' : e === EPOCHS ? 'end' : 'middle'} {...AXIS}>
            {e === EPOCHS ? `${EPOCHS} epochs` : e}
          </text>
        ))}
        <path d={`M${path}`} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={xOf(epoch)} cy={yOf(valMiou(epoch))} r="3" fill={LINE} />
        {done && (
          <g>
            <line x1={xOf(bestEpoch)} x2={xOf(bestEpoch)} y1={yOf(valMiou(bestEpoch))} y2="100" stroke={LINE} strokeWidth="0.8" strokeDasharray="2 2" />
            <text x={xOf(bestEpoch) - 4} y={yOf(valMiou(bestEpoch)) - 6} textAnchor="end" {...AXIS} fill={INK}>
              best, epoch {bestEpoch}
            </text>
          </g>
        )}
      </Box>

      {/* Found in the first post, before anyone configured anything. */}
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider', opacity: epoch >= 1 ? 1 : 0, transition: 'opacity .4s ease' }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}>
          Read from the first epoch
        </Typography>
        <Stack spacing={0.75} sx={{ mt: 0.5 }}>
          {SCRIPT_DISCOVERED.map(({ kind, names }) => (
            <Stack key={kind} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography sx={{ width: 88, fontSize: '0.85rem', color: 'text.secondary' }}>{kind}</Typography>
              {names.map((name) => (
                <Chip key={name} label={name} size="small" sx={{ fontFamily: MONO, fontSize: '0.75rem' }} />
              ))}
            </Stack>
          ))}
        </Stack>
      </Box>

      {canPlay && done && (
        <Button size="small" startIcon={<Replay />} onClick={() => { setEpoch(0); setPlaying(true); }} sx={{ mt: 1.5 }}>
          Replay
        </Button>
      )}
    </Box>
  );
}

/**
 * How a run gets in, shown rather than described: the loop that posts each
 * epoch, beside what arrives in Visin. The code is the real endpoint and
 * payload; the numbers beside it are illustrative.
 */
export default function FromYourScript() {
  return (
    <Box component="section" id="script" aria-labelledby="script-title" sx={{ py: { xs: 9, md: 14 }, bgcolor: '#fff' }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 720, mb: { xs: 5, md: 7 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1.2 }}>
            From your training loop
          </Typography>
          <Typography id="script-title" variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, mt: 1, mb: 2 }}>
            One request per epoch
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.075rem' }}>
            Post whatever your script already measures. The run is charted as it trains.
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 3, md: 4 }} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box
              component="pre"
              aria-label="Python: post each epoch's results to Visin"
              sx={{
                m: 0,
                p: { xs: 2, md: 3 },
                borderRadius: '16px',
                bgcolor: INK,
                color: 'rgba(255,255,255,0.88)',
                fontFamily: MONO,
                fontSize: { xs: '0.72rem', sm: '0.8rem', md: '0.85rem' },
                lineHeight: 1.7,
                overflowX: 'auto'
              }}
            >
              <code>{SCRIPT_SNIPPET}</code>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Arrivals />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mt: { xs: 3, md: 5 } }}>
          {SCRIPT_POINTS.map((point) => (
            <Grid key={point.title} size={{ xs: 12, md: 4 }}>
              <Stack direction="row" spacing={1.5}>
                <CheckCircleOutlined sx={{ color: 'primary.main', mt: 0.25 }} />
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{point.title}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{point.body}</Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>

        <Button href="/docs/quickstart" endIcon={<ArrowForward />} size="large" sx={{ mt: { xs: 4, md: 5 }, ml: -1.5 }}>
          Read the quickstart
        </Button>
      </Container>
    </Box>
  );
}
