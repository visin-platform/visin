import React from 'react';
import { Box, Typography } from '@mui/material';

interface ConfigDataViewProps {
  data: unknown;
  depth?: number;
}

const ConfigDataView: React.FC<ConfigDataViewProps> = ({ data, depth = 0 }) => {
  if (depth > 3) return null;

  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  if (Array.isArray(data)) {
    return `[${data.join(', ')}]`;
  }

  return (
    <Box sx={{ pl: 2 }}>
      {Object.entries(data).map(([key, value]) => (
        <Box key={key} sx={{ mb: 1 }}>
          <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
            {key}:
          </Typography>{' '}
          <Typography variant="body2" component="span">
            {typeof value === 'object' && value !== null
              ? <ConfigDataView data={value} depth={depth + 1} />
              : String(value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export default ConfigDataView;
