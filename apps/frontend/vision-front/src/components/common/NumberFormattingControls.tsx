import React from 'react';
import {
  Paper,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';

interface NumberFormattingControlsProps {
  decimals: number;
  multiplier: number;
  onDecimalsChange: (decimals: number) => void;
  onMultiplierChange: (multiplier: number) => void;
}

const NumberFormattingControls: React.FC<NumberFormattingControlsProps> = ({
  decimals,
  multiplier,
  onDecimalsChange,
  onMultiplierChange
}) => {
  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
        Number Format
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ flex: '1 1 160px', minWidth: '140px' }}>
          <FormControl fullWidth size="small">
            <InputLabel>Decimals</InputLabel>
            <Select
              value={decimals}
              label="Decimals"
              onChange={(e) => onDecimalsChange(Number(e.target.value))}
            >
              <MenuItem value={0}>0</MenuItem>
              <MenuItem value={1}>1</MenuItem>
              <MenuItem value={2}>2</MenuItem>
              <MenuItem value={3}>3</MenuItem>
              <MenuItem value={4}>4</MenuItem>
              <MenuItem value={5}>5</MenuItem>
              <MenuItem value={6}>6</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ flex: '1 1 160px', minWidth: '140px' }}>
          <FormControl fullWidth size="small">
            <InputLabel>× Multiplier</InputLabel>
            <Select
              value={multiplier}
              label="× Multiplier"
              onChange={(e) => onMultiplierChange(Number(e.target.value))}
            >
              <MenuItem value={0.01}>0.01</MenuItem>
              <MenuItem value={0.1}>0.1</MenuItem>
              <MenuItem value={1}>1</MenuItem>
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={1000}>1000</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>
    </Paper>
  );
};

export default NumberFormattingControls;
