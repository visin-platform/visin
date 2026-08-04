import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography
} from '@mui/material';
import { ArrowBack, Undo, CheckCircleOutlined, LinkOutlined } from '@mui/icons-material';
import { Loader } from '@visin/frontend-core';
import { getJob } from '../services/jobService';
import { useWorkQueue } from '../workbench/useWorkQueue';
import { DecodedImage, loadLayerPixels, loadMaskIndex } from '../workbench/idmapLoader';
import { MaskIndex } from '../workbench/maskIndex';
import { Viewport, focusBbox } from '../workbench/viewport';
import FrameViewer from '../workbench/FrameViewer';

/** Gap left under the viewer so the page itself never scrolls. */
const BOTTOM_GUTTER_PX = 8;

const WorkbenchPage: React.FC = () => {
  const { id: jobId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: job } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });
  // Read once: the param is rewritten as the labeler advances, and re-reading it
  // would restart the queue on every frame.
  const [startTaskId] = useState(() => searchParams.get('task'));
  const queue = useWorkQueue(jobId, startTaskId);

  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [maskIndex, setMaskIndex] = useState<MaskIndex | null>(null);
  const [layerPixels, setLayerPixels] = useState<DecodedImage | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [layerOpacity, setLayerOpacity] = useState(0.6);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const viewerBoxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  // Take whatever vertical space is actually left below the app chrome, rather
  // than subtracting a guessed constant from 100vh. The shell's header and
  // padding differ by breakpoint, and a guess that is too small leaves the frame
  // in a short box with the rest of a tall screen unused.
  useEffect(() => {
    const measure = () => {
      const element = rootRef.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top;
      const main = element.closest('main');
      const padding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setAvailableHeight(Math.max(480, window.innerHeight - top - padding - BOTTOM_GUTTER_PX));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const currentItem = queue.current;
  const task = currentItem?.task ?? null;
  const masks = useMemo(() => task?.payload?.maskMap?.masks ?? [], [task]);
  // The layer paints every mask in the annotation set, but a job can be scoped to
  // a subset of them — only these are clickable, the rest are dimmed.
  const maskScope = useMemo(() => new Set(masks.map((mask) => mask.id)), [masks]);
  const isMaskToggle = job?.taskType === 'mask_toggle';

  // Reset per-task state and decode the id map and layer when the task changes.
  // Both are needed to hide a marked mask: the id map says which pixels are the
  // mask, the layer supplies the pixels being erased.
  useEffect(() => {
    setRejected(new Set());
    setFocusedIdx(null);
    setViewport(null);
    setMaskIndex(null);
    setLayerPixels(null);
    setActionError(null);
    startedAtRef.current = Date.now();

    const idmapUrl = currentItem?.images.idmap?.url;
    if (!idmapUrl) return;
    let cancelled = false;
    loadMaskIndex(idmapUrl)
      .then((index) => {
        if (!cancelled) setMaskIndex(index);
      })
      .catch((err) => {
        if (!cancelled) setActionError(`Id map failed to load: ${(err as Error).message}`);
      });

    const layerUrl = currentItem?.images.layers[0]?.url;
    if (layerUrl) {
      loadLayerPixels(layerUrl)
        .then((pixels) => {
          if (!cancelled) setLayerPixels(pixels);
        })
        // Not fatal: the layer still renders as a plain image, marking still
        // records, it just cannot be hidden. Better than blocking the frame.
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [currentItem]);

  // Keep the current frame in the URL, so a labeler with a question can copy the
  // address bar and have it open on the same frame for whoever they ask.
  // `replace` rather than push: Back should leave the workbench, not walk the
  // queue backwards through frames that are no longer leased.
  const currentTaskId = task?._id ?? null;
  useEffect(() => {
    if (!currentTaskId) return;
    setLinkCopied(false);
    setSearchParams(
      (previous) => {
        if (previous.get('task') === currentTaskId) return previous;
        const next = new URLSearchParams(previous);
        next.set('task', currentTaskId);
        return next;
      },
      { replace: true }
    );
  }, [currentTaskId, setSearchParams]);

  // Composed from the router's location rather than read off window.location, so
  // the link is whatever the app actually routed to.
  const copyFrameLink = useCallback(() => {
    const url = `${window.location.origin}${location.pathname}${location.search}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => setLinkCopied(true))
      .catch(() => setActionError('Could not copy the link — copy it from the address bar instead.'));
  }, [location.pathname, location.search]);

  const toggleMask = useCallback((maskId: number) => {
    setRejected((previous) => {
      const next = new Set(previous);
      if (next.has(maskId)) {
        next.delete(maskId);
      } else {
        next.add(maskId);
      }
      return next;
    });
  }, []);

  const submit = useCallback(
    async (body: { choiceKey?: string; rejectedMaskIds?: number[] }) => {
      try {
        await queue.answer({ ...body, elapsedMs: Date.now() - startedAtRef.current });
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [queue]
  );

  const walkTo = useCallback(
    (index: number) => {
      if (masks.length === 0) return;
      const wrapped = ((index % masks.length) + masks.length) % masks.length;
      setFocusedIdx(wrapped);
      const bbox = masks[wrapped].bbox;
      const container = viewerBoxRef.current;
      if (bbox && container) {
        setViewport(focusBbox(bbox, container.clientWidth, container.clientHeight));
      }
    },
    [masks]
  );

  // Keyboard: mask-walk (Tab/Space/Enter), choice hotkeys, undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!task || (event.target as HTMLElement)?.tagName === 'INPUT') return;

      if (event.key === 'u' && queue.canUndo) {
        event.preventDefault();
        queue.undoLast().catch((err) => setActionError((err as Error).message));
        return;
      }

      // Clearing the viewport re-fits: the viewer treats null as "no framing of
      // mine yet" and fits the frame to whatever the container is now.
      if (event.key === 'f') {
        event.preventDefault();
        setViewport(null);
        return;
      }

      if (isMaskToggle) {
        if (event.key === 'Tab') {
          event.preventDefault();
          walkTo((focusedIdx ?? -1) + (event.shiftKey ? -1 : 1));
        } else if (event.key === ' ' && focusedIdx !== null) {
          event.preventDefault();
          toggleMask(masks[focusedIdx].id);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          submit({ rejectedMaskIds: [...rejected].sort((a, b) => a - b) });
        }
        return;
      }

      const choice = job?.question.choices?.find((candidate) => candidate.hotkey === event.key);
      if (choice) {
        event.preventDefault();
        submit({ choiceKey: choice.key });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [task, isMaskToggle, focusedIdx, masks, rejected, job, queue, submit, toggleMask, walkTo]);

  if (!job || queue.status === 'loading') {
    return <Loader message="Loading workbench..." />;
  }

  if (queue.status === 'error') {
    return <Alert severity="error">{queue.error}</Alert>;
  }

  if (queue.status === 'done' || !queue.current) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CheckCircleOutlined sx={{ fontSize: 56, color: 'success.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
          All done
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          No tasks left for you in this job. You answered {queue.sessionAnswered} this session.
        </Typography>
        <Button component={Link} to={`/jobs/${jobId}`} variant="contained">
          Back to job
        </Button>
      </Box>
    );
  }

  const progressTotal = job.tasksCount || 0;
  const myTotal = (job.progress?.myAnswers ?? 0) + queue.sessionAnswered;

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: availableHeight ?? 'calc(100vh - 120px)',
        minHeight: 480
      }}
    >
      {/* Progress header */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <IconButton component={Link} to={`/jobs/${jobId}`} aria-label="back to job">
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>
          {job.name}
        </Typography>
        {queue.current.task.stratum && <Chip size="small" label={queue.current.task.stratum} />}
        {queue.current.images.frame.stem && (
          <Tooltip title={linkCopied ? 'Link copied' : 'Copy a link to this frame'}>
            <Chip
              size="small"
              variant="outlined"
              icon={<LinkOutlined />}
              label={queue.current.images.frame.stem}
              onClick={copyFrameLink}
              color={linkCopied ? 'success' : 'default'}
            />
          </Tooltip>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {myTotal}/{progressTotal} · session {queue.sessionAnswered}
        </Typography>
        <Tooltip title="Undo last answer (u)">
          <span>
            <IconButton
              aria-label="undo last answer"
              disabled={!queue.canUndo}
              onClick={() => queue.undoLast().catch((err) => setActionError((err as Error).message))}
            >
              <Undo />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <LinearProgress variant="determinate" value={progressTotal ? Math.min(100, (myTotal / progressTotal) * 100) : 0} sx={{ mb: 1 }} />
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1 }}>
          {actionError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, minHeight: 0 }}>
        {/* Viewer */}
        <Box ref={viewerBoxRef} sx={{ flexGrow: 1, minWidth: 0, borderRadius: 2, overflow: 'hidden' }}>
          <FrameViewer
            images={queue.current.images}
            maskIndex={isMaskToggle ? maskIndex : null}
            layerPixels={isMaskToggle ? layerPixels : null}
            maskScope={isMaskToggle ? maskScope : null}
            rejected={rejected}
            focusedMaskId={focusedIdx !== null ? masks[focusedIdx]?.id ?? null : null}
            layerVisibility={layerVisibility}
            layerOpacity={layerOpacity}
            viewport={viewport}
            onViewportChange={setViewport}
            onToggleMask={isMaskToggle ? toggleMask : undefined}
          />
        </Box>

        {/* Controls */}
        <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {job.question.prompt}
          </Typography>

          {queue.current.images.layers.length > 0 && (
            <>
              {queue.current.images.layers.map((layer) => (
                <FormControlLabel
                  key={layer.set}
                  control={
                    <Switch
                      size="small"
                      checked={layerVisibility[layer.set] !== false}
                      onChange={(event) =>
                        setLayerVisibility((previous) => ({ ...previous, [layer.set]: event.target.checked }))
                      }
                    />
                  }
                  label={`Layer: ${layer.set}`}
                />
              ))}
              <Box sx={{ px: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Layer opacity
                </Typography>
                <Slider
                  size="small"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layerOpacity}
                  onChange={(_event, value) => setLayerOpacity(value as number)}
                  aria-label="layer opacity"
                />
              </Box>
              <Divider />
            </>
          )}

          {isMaskToggle ? (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Click a mask to mark it incorrect — its colour disappears so you can see the pixels underneath.
                Click the same spot again to bring it back. {rejected.size}/{masks.length} marked.
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Tab walks masks, Space toggles, Enter submits, F fits the frame.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={() => submit({ rejectedMaskIds: [...rejected].sort((a, b) => a - b) })}
              >
                Submit ({rejected.size} incorrect)
              </Button>
              <Button variant="text" disabled={rejected.size === 0} onClick={() => setRejected(new Set())}>
                Show all again
              </Button>
            </>
          ) : (
            <Stack spacing={1}>
              {(job.question.choices || []).map((choice) => (
                <Button key={choice.key} variant="outlined" onClick={() => submit({ choiceKey: choice.key })}>
                  {choice.label}
                  {choice.hotkey ? ` (${choice.hotkey})` : ''}
                </Button>
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default WorkbenchPage;
