import React from 'react';
import { Paper, Button, Box, Stack, IconButton, Tooltip, useTheme } from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';
import { TestResult } from '../../types';
import ResultBreakdown from './ResultBreakdown';

interface TestResultTableProps {
  testResult: TestResult;
  onLatexExport: (testResult: TestResult) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

/** One test result: its export and delete actions, then its breakdown by condition. */
const TestResultTable: React.FC<TestResultTableProps> = ({
  testResult,
  onLatexExport,
  onDeleteTestResult,
  isAuthenticated
}) => {
  const theme = useTheme();

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: tint(livePalette(theme).primary.main, 0.04),
          borderBottom: `1px solid ${livePalette(theme).divider}`
        }}>
        <Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={() => onLatexExport(testResult)}
            size="small"
          >
            Export LaTeX
          </Button>
          {onDeleteTestResult && isAuthenticated && (
            <Tooltip title="Delete Result">
              <IconButton
                size="small"
                onClick={() => onDeleteTestResult(testResult._id)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main', bgcolor: tint(livePalette(theme).error.main, 0.1) }
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
      <ResultBreakdown results={testResult.test_results} />
    </Paper>
  );
};

export default TestResultTable;
