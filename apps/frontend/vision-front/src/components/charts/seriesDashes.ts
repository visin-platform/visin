import type { SxProps, Theme } from '@mui/material';
import { labelMarkClasses, legendClasses, lineClasses } from '@mui/x-charts';

/**
 * Line patterns for series that share a colour. The palette has eight hues, and
 * a ninth would be one nobody can tell apart, so a chart with more series (or
 * two classes a project gave the same colour) repeats colours: the second line
 * in a colour is dashed, the third dotted, and so on. Colour and pattern
 * together keep every line distinct, in the plot and in the legend.
 */
const DASHES = [undefined, '6 4', '1.5 3', '8 3 1.5 3'] as const;

/** Gives each series whose colour an earlier one already used a pattern of its own. */
export function withDistinctDashes<T extends { color: string }>(series: T[]): (T & { dash?: string })[] {
  const seen = new Map<string, number>();
  return series.map((item) => {
    const key = item.color.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return { ...item, dash: DASHES[count % DASHES.length] };
  });
}

/**
 * Chart `sx` that draws each patterned series, and its legend mark, with its
 * dashes. Series need an `id`: that is what x-charts puts on the line element
 * (`data-series`) and the legend item.
 */
export function dashedSeriesSx(series: { id: string; dash?: string }[]): SxProps<Theme> {
  return Object.fromEntries(
    series
      .filter((item) => item.dash)
      .flatMap(({ id, dash }) => {
        const selector = JSON.stringify(id);
        return [
          [`& .${lineClasses.line}[data-series=${selector}]`, { strokeDasharray: dash }],
          // The legend's line mark is 16px across, drawn in a 16×8 box: halve the
          // pattern so a dash still fits in it more than once, and square the
          // round caps, which would otherwise close its gaps.
          [
            `& .${legendClasses.item}[data-series=${selector}] .${labelMarkClasses.line} path`,
            {
              strokeDasharray: dash!.split(' ').map((n) => Number(n) / 2).join(' '),
              strokeLinecap: 'butt'
            }
          ]
        ];
      })
  );
}
