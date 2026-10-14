import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Paper, Button, Box, Chip, Link, Stack, Typography, IconButton, Tooltip, useTheme } from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';
import { RunEvaluation } from '../../types';
import { formatDateTime } from '../../utils';
import VerdictChip from '../evaluations/VerdictChip';
import ResultBreakdown from './ResultBreakdown';

interface RunEvaluationCardProps {
  evaluation: RunEvaluation;
  onLatexExport: (evaluation: RunEvaluation) => void;
  onDeleteEvaluation?: (evaluationId: string) => void;
  isAuthenticated: boolean;
  /** the one the page was opened for, from the project's list: outlined so it is easy to find */
  highlighted?: boolean;
}

/**
 * One evaluation of the run: when it was reported and, where it was scored on a suite, which suite and whether it
 * ranks, then its breakdown by condition. A plain test a run reported needs nothing more than its numbers; only a
 * ranked or rankable one has anything further to look at (its evidence, publishing), on its own page.
 */
const RunEvaluationCard: React.FC<RunEvaluationCardProps> = ({
  evaluation,
  onLatexExport,
  onDeleteEvaluation,
  isAuthenticated,
  highlighted
}) => {
  const theme = useTheme();

  return (
    <Paper
      id={`evaluation-${evaluation._id}`}
      aria-current={highlighted ? 'true' : undefined}
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        ...(highlighted && { outline: '2px solid', outlineColor: 'primary.main' })
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
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
          {evaluation.suite ? (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Scored on {evaluation.suite.slug} v{evaluation.suite.version}
              </Typography>
              {evaluation.validation && <VerdictChip validation={evaluation.validation} />}
              {evaluation.publishedAt && <Chip size="small" variant="outlined" label="Public" />}
              <Link component={RouterLink} to={`/evaluations/${evaluation._id}`} variant="body2">
                Ranking and evidence
              </Link>
            </>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Reported {formatDateTime(evaluation.timestamp)}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={() => onLatexExport(evaluation)}
            size="small"
          >
            Export LaTeX
          </Button>
          {onDeleteEvaluation && isAuthenticated && (
            <Tooltip title="Delete Result">
              <IconButton
                size="small"
                onClick={() => onDeleteEvaluation(evaluation._id)}
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
      <ResultBreakdown results={evaluation.test_results} />
    </Paper>
  );
};

export default RunEvaluationCard;
