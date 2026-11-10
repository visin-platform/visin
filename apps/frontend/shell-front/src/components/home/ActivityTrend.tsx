import { Box, useMediaQuery } from '@mui/material';
import { useChartColors } from '@visin/frontend-core';
import { useEffect, useRef, useState } from 'react';
import type { ActivityWeek } from './activity';
import { formatCount } from './formatting';

export function CountValue({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shown, setShown] = useState(reduced ? value : 0);
  const current = useRef(shown);
  const format = (number: number) =>
    decimals
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(number)
      : formatCount(number);
  useEffect(() => {
    if (reduced || current.current === value) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 600);
      const next = from + (value - from) * (1 - (1 - progress) ** 3);
      current.current = next;
      setShown(Math.round(next * 10 ** decimals) / 10 ** decimals);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, decimals]);
  return (
    <Box component="output" aria-label={format(value)} aria-live="off">
      <span aria-hidden="true">{format(shown)}</span>
    </Box>
  );
}

export function ActivityTrend({ weeks, metric }: { weeks: ActivityWeek[]; metric: 'trainings' | 'hours' }) {
  const colors = useChartColors();
  const max = Math.max(1, ...weeks.map((week) => week[metric]));
  const points = weeks
    .map((week, i) => `${2 + (i * 96) / Math.max(1, weeks.length - 1)},${30 - (week[metric] / max) * 26}`)
    .join(' ');
  const label = metric === 'trainings' ? 'Trainings per week' : 'Training hours by run start week';
  return (
    <Box
      component="svg"
      role="img"
      aria-label={`${label}, last eight weeks (UTC)`}
      viewBox="0 0 100 34"
      preserveAspectRatio="none"
      sx={{ width: '100%', height: 34, overflow: 'visible' }}
    >
      <title>
        {label}:{' '}
        {weeks
          .map(
            (week) =>
              `${week.week.slice(0, 10)}: ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(week[metric])}`
          )
          .join('; ')}
      </title>
      <polyline
        fill="none"
        stroke={colors.slot(metric === 'trainings' ? 0 : 1)}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </Box>
  );
}
