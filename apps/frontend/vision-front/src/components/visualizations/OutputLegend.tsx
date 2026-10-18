import React from 'react';
import { Box, Typography } from '@mui/material';
import { CONFIDENCE_STOPS, type OutputClass } from '../../utils/outputPixels';
import { useClassColours } from '../../hooks/useOutputImages';

interface OutputLegendProps {
  kind: 'mask' | 'confidence';
  /** the classes the model was trained on */
  classes?: OutputClass[];
  /** the indices a mask uses; shown, named where the model names them, when the classes are not known */
  present?: number[];
  /** the text colour, for a legend drawn on a frame's dark backdrop */
  color?: string;
}

/** How to read a painted mask (which colour is which class) or a confidence map (which colour is how sure). */
const OutputLegend: React.FC<OutputLegendProps> = ({ kind, classes = [], present = [], color = 'text.secondary' }) => {
  const colourOf = useClassColours(classes);

  if (kind === 'confidence') {
    const floor = classes.length > 1 ? 1 / classes.length : 0;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color }} aria-label="Confidence scale">
        <Typography variant="caption">{floor.toFixed(2)}</Typography>
        <Box
          sx={{
            width: 160,
            height: 10,
            borderRadius: 1,
            background: `linear-gradient(to right, ${CONFIDENCE_STOPS.join(', ')})`
          }}
        />
        <Typography variant="caption">1.00</Typography>
        <Typography variant="caption">p of the predicted class</Typography>
      </Box>
    );
  }

  const shown: OutputClass[] = classes.length
    ? classes.filter((entry) => present.length === 0 || present.includes(entry.index))
    : present.map((index) => ({ index, name: `Class ${index}` }));
  if (shown.length === 0) return null;
  return (
    <Box component="ul" aria-label="Classes" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, m: 0, p: 0, listStyle: 'none', color }}>
      {shown.map((entry) => (
        <Box component="li" key={entry.index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: colourOf(entry.index) }} />
          <Typography variant="caption">{entry.name}</Typography>
        </Box>
      ))}
    </Box>
  );
};

export default OutputLegend;
