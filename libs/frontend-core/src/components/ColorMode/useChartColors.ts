import { useColorScheme } from '@mui/material';
import { chartSeries } from '../../theme';

export interface ChartColors {
  /** The eight series colours of the scheme showing, in slot order. */
  series: readonly string[];
  /** Slot `index`, wrapping past the eighth. */
  slot: (index: number) => string;
  /**
   * A stored colour (a project's class colour, say) as it should draw in the
   * scheme showing: a light-scheme series colour becomes its dark step, and any
   * other colour is someone's deliberate choice, left alone.
   */
  adapt: (color: string) => string;
}

/** Chart series colours for the scheme that is showing. */
export function useChartColors(): ChartColors {
  const { colorScheme } = useColorScheme();
  const series = colorScheme === 'dark' ? chartSeries.dark : chartSeries.light;
  return {
    series,
    slot: (index) => series[index % series.length],
    adapt: (color) => {
      const index = (chartSeries.light as readonly string[]).indexOf(color.toLowerCase());
      return index === -1 ? color : series[index];
    }
  };
}
