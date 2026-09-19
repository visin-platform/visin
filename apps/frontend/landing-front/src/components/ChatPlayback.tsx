import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography, useMediaQuery } from '@mui/material';
import { AutoAwesome, CheckCircle, Replay } from '@mui/icons-material';
import type { ChatTurn } from '../content';

/**
 * The sample session, played the way a real one unfolds: the question arrives,
 * the assistant calls Visin's MCP tools — each spinning, then done — and its
 * answer streams in, with the curves it read drawing themselves beneath.
 *
 * Everything on screen is a pure function of one clock (`t`, milliseconds since
 * the section scrolled into view), so a frame never depends on the one before
 * and replaying is resetting the clock. Where it cannot play — someone asked
 * for less motion, or there is no IntersectionObserver to start it — the clock
 * is simply at its end, and the whole transcript shows at once.
 */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const TOOL_MS = 650;
const WORD_MS = 38;
const CHART_MS = 1400;
const LINE_MS = 170;
const GAP_MS = 450;

interface Timed {
  start: number;
  duration: number;
}

interface TurnSchedule {
  appear: number;
  tools: (Timed & { name: string })[];
  answer: Timed;
  chart?: Timed;
  code?: Timed;
  done: number;
}

/** When each part of each turn starts and how long it runs. */
function scheduleConversation(turns: ChatTurn[]): { turns: TurnSchedule[]; total: number } {
  let clock = 300;
  const scheduled = turns.map((turn) => {
    const appear = clock;
    if (turn.from === 'you') {
      clock += 700 + GAP_MS;
      return { appear, tools: [], answer: { start: appear, duration: 1 }, done: clock };
    }
    const tools = (turn.tools ?? []).map((name, index) => ({ name, start: appear + index * TOOL_MS, duration: TOOL_MS }));
    clock = appear + tools.length * TOOL_MS;
    const answer = { start: clock, duration: turn.text.split(' ').length * WORD_MS };
    clock += answer.duration;
    const chart = turn.chart ? { start: clock + 150, duration: CHART_MS } : undefined;
    if (chart) clock = chart.start + chart.duration;
    const code = turn.code ? { start: clock + 150, duration: turn.code.split('\n').length * LINE_MS } : undefined;
    if (code) clock = code.start + code.duration;
    clock += GAP_MS;
    return { appear, tools, answer, chart, code, done: clock };
  });
  return { turns: scheduled, total: clock };
}

const progressOf = (t: number, { start, duration }: Timed) => Math.min(1, Math.max(0, (t - start) / duration));

/** The chart's value range: the plateau the answer is about, not the climb to it. */
const Y_LOW = 0.3;
const Y_HIGH = 0.465;
const yOf = (value: number) => 100 - ((value - Y_LOW) / (Y_HIGH - Y_LOW)) * 92;
const xOf = (epoch: number) => 8 + (epoch / 200) * 284;

/** Illustrative validation mIoU, shaped like the ablation in the answer. */
function valueAt(peak: number, bestEpoch: number, epoch: number): number {
  const rise = peak * (1 - Math.exp(-epoch / 18));
  const decline = epoch > bestEpoch ? (epoch - bestEpoch) * 0.00025 : 0;
  const wobble = Math.sin(epoch * 0.9 + peak * 100) * 0.0025;
  return rise - decline + wobble;
}

function curve(peak: number, bestEpoch: number): string {
  // From where the run enters the frame, so the climb below it is not drawn
  // as a flat line along the bottom.
  const points: string[] = [];
  for (let epoch = 0; epoch <= 200; epoch += 4) {
    const value = valueAt(peak, bestEpoch, epoch);
    if (value >= Y_LOW) points.push(`${xOf(epoch).toFixed(1)},${yOf(value).toFixed(1)}`);
  }
  return `M${points.join(' L')}`;
}

const RUNS = [
  { name: 'window16', color: '#60A5FA', peak: 0.451, best: 185 },
  { name: 'window8', color: '#F472B6', peak: 0.447, best: 195 }
];

const AXIS = { fill: 'rgba(255,255,255,0.45)', fontSize: 8, fontFamily: MONO };

function CurvesChart({ progress }: { progress: number }) {
  return (
    <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <Stack direction="row" spacing={2} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontFamily: MONO }}>val mIoU</Typography>
        {RUNS.map((run) => (
          <Stack key={run.name} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 10, height: 2, bgcolor: run.color, borderRadius: 1 }} />
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontFamily: MONO }}>{run.name}</Typography>
          </Stack>
        ))}
      </Stack>
      <Box
        component="svg"
        viewBox="0 0 300 116"
        role="img"
        aria-label="Validation mIoU of window16 and window8 over 200 epochs, peaking at epochs 185 and 195"
        sx={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {[0.35, 0.4, 0.45].map((value) => (
          <g key={value}>
            <line x1="8" x2="292" y1={yOf(value)} y2={yOf(value)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x="0" y={yOf(value) - 2} {...AXIS}>
              {value.toFixed(2)}
            </text>
          </g>
        ))}
        {[0, 100, 200].map((epoch) => (
          <text key={epoch} x={xOf(epoch)} y="114" textAnchor={epoch === 200 ? 'end' : 'middle'} {...AXIS}>
            {epoch === 200 ? '200 epochs' : epoch}
          </text>
        ))}
        {RUNS.map((run) => (
          <path
            key={run.name}
            d={curve(run.peak, run.best)}
            fill="none"
            stroke={run.color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - progress}
          />
        ))}
        {/* Each run's best epoch, marked once its line has reached it; the two
            labels sit either side of the lines, which run almost together. */}
        {RUNS.map((run, index) =>
          progress >= run.best / 200 ? (
            <g key={run.name}>
              <line
                x1={xOf(run.best)}
                x2={xOf(run.best)}
                y1={yOf(run.peak)}
                y2="104"
                stroke={run.color}
                strokeWidth="0.8"
                strokeDasharray="2 2"
                opacity="0.7"
              />
              <circle cx={xOf(run.best)} cy={yOf(run.peak)} r="3" fill={run.color} />
              <text x={xOf(run.best) - 5} y={index === 0 ? yOf(run.peak) - 5 : yOf(run.peak) + 11} textAnchor="end" {...AXIS} fill={run.color}>
                {run.best}
              </text>
            </g>
          ) : null
        )}
      </Box>
    </Box>
  );
}

function ToolCall({ name, progress }: { name: string; progress: number }) {
  const done = progress >= 1;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', opacity: progress > 0 ? 1 : 0, transition: 'opacity .2s ease' }}>
      {done ? (
        <CheckCircle sx={{ fontSize: 14, color: '#34D399' }} />
      ) : (
        <CircularProgress size={12} thickness={6} sx={{ color: 'primary.light' }} />
      )}
      <Typography sx={{ fontFamily: MONO, fontSize: '0.775rem', color: done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)' }}>
        {name}
      </Typography>
    </Stack>
  );
}

const appearSx = (visible: boolean) =>
  ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : 'translateY(8px)',
    transition: 'opacity .35s ease, transform .35s ease'
  }) as const;

function Turn({ turn, schedule, t }: { turn: ChatTurn; schedule: TurnSchedule; t: number }) {
  const visible = t >= schedule.appear;

  if (turn.from === 'you') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', ...appearSx(visible) }}>
        <Box
          sx={{
            maxWidth: { xs: '100%', sm: '78%' },
            px: 2.25,
            py: 1.5,
            borderRadius: '16px 16px 4px 16px',
            bgcolor: 'primary.main',
            color: '#fff',
            fontSize: '0.95rem',
            lineHeight: 1.55
          }}
        >
          {turn.text}
        </Box>
      </Box>
    );
  }

  const words = turn.text.split(' ');
  const shownWords = Math.round(progressOf(t, schedule.answer) * words.length);
  const answering = shownWords > 0;
  const codeLines = turn.code?.split('\n') ?? [];
  const shownLines = schedule.code ? Math.round(progressOf(t, schedule.code) * codeLines.length) : 0;

  return (
    <Box sx={{ display: 'flex', gap: 1.5, maxWidth: { xs: '100%', sm: '92%' }, ...appearSx(visible) }}>
      <Box
        aria-hidden
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          mt: 0.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)'
        }}
      >
        <AutoAwesome sx={{ fontSize: 15, color: 'primary.light' }} />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        {schedule.tools.length > 0 && (
          <Stack spacing={0.5} sx={{ mb: 1, mt: 0.75 }}>
            {schedule.tools.map((tool) => (
              <ToolCall key={tool.name} name={tool.name} progress={progressOf(t, tool)} />
            ))}
          </Stack>
        )}

        {answering && (
          <Typography
            sx={{
              px: 2.25,
              py: 1.5,
              borderRadius: '16px 16px 16px 4px',
              bgcolor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.95rem',
              lineHeight: 1.65
            }}
          >
            {shownWords >= words.length ? turn.text : words.slice(0, shownWords).join(' ')}
          </Typography>
        )}

        {schedule.chart && t >= schedule.chart.start && <CurvesChart progress={progressOf(t, schedule.chart)} />}

        {turn.code && shownLines > 0 && (
          <Box
            component="pre"
            sx={{
              m: 0,
              mt: 1,
              p: 1.75,
              borderRadius: 2,
              bgcolor: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
              fontFamily: MONO,
              fontSize: '0.775rem',
              lineHeight: 1.7,
              overflowX: 'auto'
            }}
          >
            {shownLines >= codeLines.length ? turn.code : codeLines.slice(0, shownLines).join('\n')}
          </Box>
        )}

        {turn.via && t >= schedule.done - 450 && (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1, pl: 0.5 }}>
            <Box aria-hidden sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'primary.light', flexShrink: 0 }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.775rem', fontFamily: MONO }}>{turn.via}</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default function ChatPlayback({ turns }: { turns: ChatTurn[] }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canPlay = !reducedMotion && typeof window !== 'undefined' && 'IntersectionObserver' in window;
  const { turns: schedule, total } = useMemo(() => scheduleConversation(turns), [turns]);

  const [t, setT] = useState(canPlay ? 0 : Infinity);
  const [started, setStarted] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  // The pending animation frame; 0 when none (cancelling 0 is a no-op).
  const frame = useRef(0);

  const play = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const begin = performance.now();
    const tick = (now: number) => {
      const elapsed = now - begin;
      setT(elapsed);
      frame.current = elapsed < total ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [total]);

  // Starts the first time the chat is mostly on screen.
  useEffect(() => {
    if (!canPlay || started || !container.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [canPlay, started, play]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const transcript = (at: number) => (
    <Stack spacing={2.5} sx={{ p: { xs: 2, md: 3 } }}>
      {turns.map((turn, index) => (
        <Turn key={`${turn.from}-${index}`} turn={turn} schedule={schedule[index]} t={at} />
      ))}
    </Stack>
  );

  const replayRow = (onClick?: () => void) => (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 2, display: 'flex', justifyContent: 'flex-end' }}>
      <Button size="small" startIcon={<Replay />} onClick={onClick} sx={{ color: 'rgba(255,255,255,0.7)' }}>
        Replay
      </Button>
    </Box>
  );

  if (!canPlay) {
    return <Box ref={container}>{transcript(Infinity)}</Box>;
  }

  // The finished conversation, invisible, holds the space it will take, and the
  // playback runs over it: the page below stays put rather than sliding down as
  // each reply arrives.
  return (
    <Box ref={container} sx={{ position: 'relative' }}>
      <Box aria-hidden sx={{ visibility: 'hidden' }}>
        {transcript(Infinity)}
        {replayRow()}
      </Box>
      <Box data-testid="chat-live" sx={{ position: 'absolute', inset: 0 }}>
        {transcript(t)}
        {started && t >= total && replayRow(play)}
      </Box>
    </Box>
  );
}
