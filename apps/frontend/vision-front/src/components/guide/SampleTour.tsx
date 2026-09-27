import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, Paper, Popper, Typography } from '@mui/material';
import { glass } from '@visin/frontend-core';
import { SAMPLE_TOUR } from './sampleTourSteps';

/** How long to look for a step's element, which may render after the page's data arrives. */
const FIND_ATTEMPTS = 20;
const FIND_INTERVAL_MS = 100;

interface SampleTourProps {
  /** Opens the page's own delete confirmation for this training. */
  onDeleteSample: () => void;
}

/**
 * The short tour a sample run opens with (`?guide=sample`).
 *
 * Its state is the URL and nothing else, so leaving midway leaves nothing
 * behind. A step whose element is not on the page (a narrow screen, a chart
 * that did not render) is skipped rather than pointing at nothing.
 */
const SampleTour: React.FC<SampleTourProps> = ({ onDeleteSample }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('guide') === 'sample';
  const [index, setIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const end = useCallback(() => {
    setAnchorEl(null);
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('guide');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (!active) return undefined;
    const step = SAMPLE_TOUR[index];
    if (!step) {
      end();
      return undefined;
    }
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const find = () => {
      const element = document.querySelector<HTMLElement>(`[data-guide="${step.anchor}"]`);
      if (element) {
        element.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        setAnchorEl(element);
      } else if (++attempts < FIND_ATTEMPTS) {
        timer = setTimeout(find, FIND_INTERVAL_MS);
      } else {
        setIndex((current) => current + 1);
      }
    };
    find();
    return () => clearTimeout(timer);
  }, [active, index, end]);

  const step = SAMPLE_TOUR[index];
  if (!active || !step || !anchorEl) return null;

  const next = () => {
    setAnchorEl(null);
    setIndex((current) => current + 1);
  };

  return (
    <Popper
      open
      anchorEl={anchorEl}
      placement="bottom"
      modifiers={[{ name: 'offset', options: { offset: [0, 12] } }, { name: 'flip', enabled: true }]}
      sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
    >
      <Paper
        role="dialog"
        aria-label={step.title}
        elevation={0}
        sx={{ ...glass, p: 2, maxWidth: 340, borderRadius: 3 }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {index + 1} of {SAMPLE_TOUR.length}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {step.title}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {step.body}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button size="small" onClick={end}>
            End tour
          </Button>
          {step.deletes ? (
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={() => {
                end();
                onDeleteSample();
              }}
            >
              Delete this sample
            </Button>
          ) : (
            <Button size="small" variant="contained" onClick={next}>
              Next
            </Button>
          )}
        </Box>
      </Paper>
    </Popper>
  );
};

export default SampleTour;
