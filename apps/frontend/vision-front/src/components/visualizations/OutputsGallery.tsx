import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { onImage } from '@visin/frontend-core';
import { epochOutputsQuery, GALLERY_LIMIT, useRunClasses } from '../../hooks/useOutputImages';
import type { Visualization } from '../../types';
import { frameOf, OUTPUT_KIND_LABELS, OUTPUT_KINDS, type OutputClass, type OutputKind } from '../../utils/outputPixels';
import OutputImage from './OutputImage';
import OutputLegend from './OutputLegend';

/** Frames laid out before "Show more". */
const FRAMES_PER_PAGE = 24;
/** A thumbnail is decoded no wider than this. */
const THUMBNAIL_WIDTH = 480;
/** Past this many epochs, a menu picks one instead of a row of buttons. */
const EPOCH_BUTTONS = 10;

const tileSx = {
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  bgcolor: onImage.backdrop,
  borderRadius: 1
} as const;

interface OutputsGalleryProps {
  trainingId: string;
  trainingUuid: string;
  /** the output kinds this training has */
  kinds: OutputKind[];
  /** the epochs that have outputs, in any order */
  epochs: number[];
  /** the epoch to open on; the latest when absent or not among `epochs` */
  initialEpoch?: number;
  onImageClick: (visualization: Visualization, classes: OutputClass[]) => void;
}

/**
 * What a run's model produced on each frame, side by side: the prediction, the class mask painted in its classes'
 * colours and the confidence map, one row per frame, for one epoch at a time.
 */
const OutputsGallery: React.FC<OutputsGalleryProps> = ({
  trainingId,
  trainingUuid,
  kinds,
  epochs,
  initialEpoch,
  onImageClick
}) => {
  const ordered = useMemo(() => [...new Set(epochs)].sort((a, b) => a - b), [epochs]);
  const [epoch, setEpoch] = useState<number | undefined>(
    initialEpoch !== undefined && ordered.includes(initialEpoch) ? initialEpoch : ordered[ordered.length - 1]
  );
  const [shown, setShown] = useState(FRAMES_PER_PAGE);
  const [search, setSearch] = useState('');
  const runKinds = OUTPUT_KINDS.filter((kind) => kinds.includes(kind));
  const results = useQueries({ queries: runKinds.map((kind) => epochOutputsQuery(trainingUuid, kind, epoch)) });
  const classes = useRunClasses(trainingId, epoch);

  const loading = results.some((result) => result.isLoading);
  const failed = results.some((result) => result.isError);
  const shortened = runKinds.flatMap((kind, index) => {
    const data = results[index].data;
    return data && data.pagination.total > data.visualizations.length ? [{ kind, total: data.pagination.total }] : [];
  });
  // Only the kinds this epoch has: a column of "not uploaded" says nothing.
  const epochKinds = runKinds.filter((_, index) => (results[index].data?.visualizations.length ?? 0) > 0);

  const frames = useMemo(() => {
    const byFrame = new Map<string, Partial<Record<OutputKind, Visualization>>>();
    const all = results
      .flatMap((result) => result.data?.visualizations ?? [])
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    // The newest upload of a frame wins, as it does in the model's outputs.
    for (const visualization of all) {
      const frame = frameOf(visualization);
      byFrame.set(frame, { ...byFrame.get(frame), [visualization.type as OutputKind]: visualization });
    }
    return [...byFrame.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [results]);
  const term = search.trim().toLowerCase();
  const matching = term ? frames.filter(([frame]) => frame.toLowerCase().includes(term)) : frames;

  const pickEpoch = (value: number) => {
    setEpoch(value);
    setShown(FRAMES_PER_PAGE);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mr: 1 }}>Model outputs</Typography>
        {ordered.length > EPOCH_BUTTONS ? (
          <TextField
            select
            size="small"
            label="Epoch"
            value={epoch ?? ''}
            onChange={(event) => pickEpoch(Number(event.target.value))}
            sx={{ minWidth: 120 }}
          >
            {ordered.map((value) => (
              <MenuItem key={value} value={value}>Epoch {value}</MenuItem>
            ))}
          </TextField>
        ) : (
          ordered.map((value) => (
            <Button
              key={value}
              size="small"
              variant={value === epoch ? 'contained' : 'outlined'}
              onClick={() => pickEpoch(value)}
              aria-pressed={value === epoch}
            >
              Epoch {value}
            </Button>
          ))
        )}
        <TextField
          size="small"
          label="Find a frame"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShown(FRAMES_PER_PAGE);
          }}
          sx={{ ml: { sm: 'auto' }, minWidth: 200 }}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} aria-label="Loading outputs" />
        </Box>
      ) : failed ? (
        <Alert severity="error">Failed to load the model outputs</Alert>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            {epochKinds.includes('mask') &&
              (classes.length > 0 ? (
                <OutputLegend kind="mask" classes={classes} />
              ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  The run’s stored weights don’t name its classes, so a mask’s colours stand for class numbers.
                </Typography>
              ))}
            {epochKinds.includes('confidence') && <OutputLegend kind="confidence" classes={classes} />}
          </Box>
          {shortened.map(({ kind, total }) => (
            <Typography key={kind} variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              Showing the latest {GALLERY_LIMIT} of {total} {OUTPUT_KIND_LABELS[kind].toLowerCase()} images for this epoch.
            </Typography>
          ))}
          {frames.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No outputs for this epoch</Typography>
          ) : matching.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No frame matches “{search.trim()}”</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {matching.length === frames.length
                  ? `${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}`
                  : `${matching.length} of ${frames.length} frames`}
                {' · '}select an image to see it full size and read its pixels
              </Typography>
              {matching.slice(0, shown).map(([frame, byKind]) => (
                <Card key={frame} variant="outlined" component="section" aria-label={`Frame ${frame}`}>
                  <CardContent>
                    <Typography variant="subtitle2" component="h4" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{frame}</Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: `repeat(${epochKinds.length}, minmax(0, 1fr))` },
                        gap: 1.5
                      }}
                    >
                      {epochKinds.map((kind) => {
                        const visualization = byKind[kind];
                        return (
                          <Box key={kind}>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                              {OUTPUT_KIND_LABELS[kind]}
                            </Typography>
                            {visualization ? (
                              <ButtonBase
                                onClick={() => onImageClick(visualization, classes)}
                                aria-label={`Open the ${OUTPUT_KIND_LABELS[kind].toLowerCase()} for ${frame}`}
                                sx={{ display: 'block', width: '100%', borderRadius: 1 }}
                                focusRipple
                              >
                                <OutputImage
                                  visualization={visualization}
                                  classes={classes}
                                  maxWidth={THUMBNAIL_WIDTH}
                                  alt={`${OUTPUT_KIND_LABELS[kind]} for ${frame}`}
                                  sx={tileSx}
                                />
                              </ButtonBase>
                            ) : (
                              <Box
                                sx={{
                                  ...tileSx,
                                  bgcolor: 'transparent',
                                  border: 1,
                                  borderStyle: 'dashed',
                                  borderColor: 'divider',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Not uploaded</Typography>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>
              ))}
              {matching.length > shown && (
                <Button onClick={() => setShown((count) => count + FRAMES_PER_PAGE)} sx={{ alignSelf: 'center' }}>
                  Show more ({matching.length - shown} more {matching.length - shown === 1 ? 'frame' : 'frames'})
                </Button>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default OutputsGallery;
