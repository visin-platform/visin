import React from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  useTheme,
  alpha
} from '@mui/material';

interface ConfusionMatrixProps {
  confusionMatrix: number[][];
  classNames?: string[];
  title?: string;
}

const ConfusionMatrix: React.FC<ConfusionMatrixProps> = ({
  confusionMatrix,
  classNames = ['Background', 'Vehicle', 'Sign', 'Human'],
  title = 'Confusion Matrix'
}) => {
  const theme = useTheme();

  const formatNumber = (value: number): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      // Format large numbers with commas
      return value.toLocaleString();
    }
    return '0';
  };

  if (!confusionMatrix || !Array.isArray(confusionMatrix) || confusionMatrix.length === 0) {
    return (
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          borderRadius: 2,
          p: 2,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          {title}
        </Typography>
        <Typography sx={{
          color: "text.secondary"
        }}>
          No confusion matrix data available
        </Typography>
      </Paper>
    );
  }

  const matrixSize = confusionMatrix.length;

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper'
      }}
    >
      <Box
        sx={{
          p: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: `1px solid ${theme.palette.divider}`
        }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Predicted vs Actual classes (rows = actual, columns = predicted)
        </Typography>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
              <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                Actual / Predicted
              </TableCell>
              {classNames.slice(0, matrixSize).map((className, index) => (
                <TableCell
                  key={index}
                  align="center"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    minWidth: 80
                  }}
                >
                  {className}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {confusionMatrix.map((row, rowIndex) => (
              <TableRow key={rowIndex} hover>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    borderRight: `1px solid ${theme.palette.divider}`,
                    fontSize: '0.75rem'
                  }}
                >
                  {classNames[rowIndex] || `Class ${rowIndex}`}
                </TableCell>
                {row.map((value, colIndex) => (
                  <TableCell
                    key={colIndex}
                    align="center"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      bgcolor: rowIndex === colIndex
                        ? alpha(theme.palette.success.main, 0.1)
                        : 'inherit'
                    }}
                  >
                    {formatNumber(value)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ p: 2, pt: 1 }}>
        <Typography variant="caption" sx={{
          color: "text.secondary"
        }}>
          Diagonal values (highlighted) represent correct predictions.
          Total samples: {formatNumber(confusionMatrix.flat().reduce((sum, val) => sum + val, 0))}
        </Typography>
      </Box>
    </Paper>
  );
};

export default ConfusionMatrix;