import { useTheme } from '@mui/material';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useDrawingArea, useXScale, useYScale } from '@mui/x-charts/hooks';
import { livePalette, tint } from '@visin/frontend-core';
import { formatReading, type BestEpoch } from './bestEpoch';

/**
 * Drawn inside a line chart: a line and a dot at the best epoch, labelled "best 0.812 @ 63", and the epochs after it
 * shaded when the run ended far from that best. The same reading the analyst gives in chat, so the two agree.
 */
export function BestEpochMarker({ best, color }: { best: BestEpoch; color: string }) {
  const theme = useTheme();
  const palette = livePalette(theme);
  const x = useXScale() as unknown as (value: number) => number | undefined;
  const y = useYScale() as unknown as (value: number) => number | undefined;
  const { top, height, left, width } = useDrawingArea();
  const bestX = x(best.epoch);
  // Near the right edge the label would run out of the chart, so it sits on the line's left there.
  const nearEnd = bestX !== undefined && bestX - left > width * 0.7;
  const bestY = y(best.value);
  if (bestX === undefined || !Number.isFinite(bestX)) return null;
  return (
    <g data-testid="best-epoch-marker">
      {best.drifted && (
        <rect
          x={bestX}
          y={top}
          width={Math.max(0, left + width - bestX)}
          height={height}
          fill={tint(palette.warning.main, 0.08)}
          pointerEvents="none"
        />
      )}
      <ChartsReferenceLine
        x={best.epoch}
        label={`best ${formatReading(best.value)} @ ${best.epoch}`}
        labelAlign="start"
        spacing={{ x: nearEnd ? -6 : 6, y: 4 }}
        lineStyle={{ stroke: palette.text.secondary, strokeDasharray: '4 4' }}
        labelStyle={{ fill: palette.text.secondary, fontSize: 12, textAnchor: nearEnd ? 'end' : 'start' }}
      />
      {bestY !== undefined && Number.isFinite(bestY) && (
        <circle
          cx={bestX}
          cy={bestY}
          r={5}
          fill={color}
          stroke={palette.background.paper}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
