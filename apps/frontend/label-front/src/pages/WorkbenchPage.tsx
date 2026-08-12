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
import {
  ArrowBack,
  Undo,
  CheckCircleOutlined,
  LinkOutlined,
  NavigateBefore,
  NavigateNext,
  PlaylistPlay,
  Login
} from '@mui/icons-material';
import { Loader } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
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
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { data: job } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });
  // Read once: the param is rewritten as the labeler advances, and re-reading it
  // would restart the queue on every frame.
  const [startTaskId] = useState(() => searchParams.get('task'));
  // Read once for the same reason: the queue must not restart when the flag is
  // dropped from the URL on the first frame change.
  const [startBrowsing] = useState(() => searchParams.get('browse') === '1');
  // Pulling takes a lease, which needs a signed-in labeler and a job that is
  // actually taking answers; anyone else opens straight into browse mode.
  const canPull = isAuthenticated && job?.status === 'active';
  // A completed job stopped handing out work, but its answers stay correctable.
  const canLabel = isAuthenticated && (job?.status === 'active' || job?.status === 'completed');
  const queue = useWorkQueue(jobId, {
    startTaskId,
    canPull,
    startBrowsing,
    enabled: Boolean(job) && !authLoading
  });

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

  // A frame that was already labeled opens showing what was decided, not a
  // blank slate: your own verdict when you have one, otherwise the most recent
  // one from anyone, so stepping back to a frame shows the masks as they were
  // left and marking one more is an edit rather than a re-do from scratch.
  const savedRejected = currentItem?.answer.mine?.rejectedMaskIds ?? null;
  const existingChoiceKey = currentItem?.answer.mine?.choiceKey ?? currentItem?.answer.latest?.choiceKey ?? null;
  const answeredByMe = Boolean(currentItem?.answer.mine);
  const answeredByAnyone = (currentItem?.answer.count ?? 0) > 0;
  // Whether what is on screen still differs from what is stored — what turns the
  // submit button from "Save changes" into an already-saved, inert one.
  const dirty =
    !answeredByMe ||
    rejected.size !== (savedRejected?.length ?? 0) ||
    (savedRejected ?? []).some((id) => !rejected.has(id));

  // Seed the marks from whatever verdict the frame already carries, and reset
  // the rest of the per-frame state. Keyed on the task rather than the item, so
  // saving an answer — which rewrites the item in place — does not wipe the
  // marks the labeler is still working on.
  const taskId = currentItem?.task._id ?? null;
  const initialRejected = currentItem?.answer.mine?.rejectedMaskIds ?? currentItem?.answer.latest?.rejectedMaskIds;
  useEffect(() => {
    setRejected(new Set(initialRejected ?? []));
    setFocusedIdx(null);
    setViewport(null);
    setActionError(null);
    startedAtRef.current = Date.now();
    // `initialRejected` is a property of the task being opened, read once here
    // rather than tracked — re-running on it would undo the labeler's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Decode the id map and layer for the frame. Both are needed to hide a marked
  // mask: the id map says which pixels are the mask, the layer supplies the
  // pixels being erased. Keyed on the URLs, which change only with the frame.
  const idmapUrl = currentItem?.images.idmap?.url;
  const layerUrl = currentItem?.images.layers[0]?.url;
  useEffect(() => {
    setMaskIndex(null);
    setLayerPixels(null);
    if (!idmapUrl) return;
    let cancelled = false;
    loadMaskIndex(idmapUrl)
      .then((index) => {
        if (!cancelled) setMaskIndex(index);
      })
      .catch((err) => {
        if (!cancelled) setActionError(`Id map failed to load: ${(err as Error).message}`);
      });

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
  }, [idmapUrl, layerUrl]);

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
        setActionError(null);
        await queue.answer({ ...body, elapsedMs: Date.now() - startedAtRef.current });
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [queue]
  );

  const position = currentItem?.position ?? null;
  const step = useCallback(
    (delta: number) => {
      if (!position) return;
      const target = position.index + delta;
      if (target < 0 || target >= position.total) return;
      queue.goTo(target).catch((err) => setActionError((err as Error).message));
    },
    [position, queue]
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

  // Keyboard: frame stepping (arrows), mask-walk (Tab/Space/Enter), choice
  // hotkeys, undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!task || (event.target as HTMLElement)?.tagName === 'INPUT') return;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }

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

      if (!canLabel) return;

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
  }, [task, isMaskToggle, canLabel, focusedIdx, masks, rejected, job, queue, step, submit, toggleMask, walkTo]);

  if (!job || queue.status === 'loading') {
    return <Loader message="Loading workbench..." />;
  }

  if (queue.status === 'error') {
    return <Alert severity="error">{queue.error}</Alert>;
  }

  if (queue.status === 'done' || !queue.current) {
    const hasFrames = (job.tasksCount || 0) > 0;
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CheckCircleOutlined sx={{ fontSize: 56, color: 'success.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
          {hasFrames ? 'All done' : 'No frames yet'}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          {hasFrames
            ? `No tasks left for you in this job. You answered ${queue.sessionAnswered} this session.`
            : 'This job has no frames materialized yet.'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
          {/* The queue being empty doesn't mean there's nothing to look at: the
              frames are all still there, already labeled, and reviewing them is
              exactly what someone does next. */}
          {hasFrames && (
            <Button
              variant="outlined"
              startIcon={<NavigateBefore />}
              onClick={() => queue.goTo(0).catch((err) => setActionError((err as Error).message))}
            >
              Review labeled frames
            </Button>
          )}
          <Button component={Link} to={`/jobs/${jobId}`} variant="contained">
            Back to job
          </Button>
        </Stack>
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
        {/* Stepping through the job's frames in order — the way back to a frame
            that was labeled earlier, and forward again afterwards. */}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="Previous frame (←)">
            <span>
              <IconButton
                aria-label="previous frame"
                size="small"
                disabled={queue.navigating || position === null || position.index === 0}
                onClick={() => step(-1)}
              >
                <NavigateBefore />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 92, textAlign: 'center' }}>
            {position ? `${position.index + 1} / ${position.total}` : '—'}
          </Typography>
          <Tooltip title="Next frame (→)">
            <span>
              <IconButton
                aria-label="next frame"
                size="small"
                disabled={queue.navigating || position === null || position.index + 1 >= position.total}
                onClick={() => step(1)}
              >
                <NavigateNext />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Chip
          size="small"
          variant={answeredByAnyone ? 'filled' : 'outlined'}
          color={answeredByMe ? 'success' : answeredByAnyone ? 'info' : 'default'}
          label={answeredByMe ? 'labeled by you' : answeredByAnyone ? `${queue.current.answer.count} labels` : 'unlabeled'}
        />
        {queue.browsing && canPull && (
          <Tooltip title="Stop browsing and take the next unlabeled frame">
            <span>
              <IconButton aria-label="resume queue" size="small" disabled={queue.navigating} onClick={() => queue.resumeQueue().catch((err) => setActionError((err as Error).message))}>
                <PlaylistPlay />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {myTotal}/{progressTotal} · session {queue.sessionAnswered}
        </Typography>
        <Tooltip title={queue.browsing ? 'Remove your answer on this frame (u)' : 'Undo last answer (u)'}>
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

          {/* A frame someone else already labeled opens with their verdict on
              screen, so say whose it is — otherwise the marks read as your own. */}
          {!answeredByMe && answeredByAnyone && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Showing an existing label for this frame.
            </Alert>
          )}

          {isMaskToggle ? (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Click a mask to mark it incorrect — its colour disappears so you can see the pixels underneath.
                Click the same spot again to bring it back. {rejected.size}/{masks.length} marked.
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                ← → step frames, Tab walks masks, Space toggles{canLabel ? ', Enter submits' : ''}, F fits the frame.
              </Typography>
              {canLabel && (
                <>
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={answeredByMe && !dirty}
                    onClick={() => submit({ rejectedMaskIds: [...rejected].sort((a, b) => a - b) })}
                  >
                    {answeredByMe ? (dirty ? 'Save changes' : 'Saved') : `Submit (${rejected.size} incorrect)`}
                  </Button>
                  <Button variant="text" disabled={rejected.size === 0} onClick={() => setRejected(new Set())}>
                    Show all again
                  </Button>
                </>
              )}
            </>
          ) : (
            <Stack spacing={1}>
              {(job.question.choices || []).map((choice) => {
                const chosen = existingChoiceKey === choice.key;
                return (
                  <Button
                    key={choice.key}
                    variant={chosen ? 'contained' : 'outlined'}
                    color={chosen && answeredByMe ? 'success' : 'primary'}
                    disabled={!canLabel}
                    onClick={() => submit({ choiceKey: choice.key })}
                  >
                    {choice.label}
                    {choice.hotkey ? ` (${choice.hotkey})` : ''}
                  </Button>
                );
              })}
            </Stack>
          )}

          {/* Signed out: everything above is still explorable — masks toggle,
              layers fade, frames step — only saving needs an account. */}
          {!isAuthenticated && (
            <Button variant="contained" startIcon={<Login />} onClick={login}>
              Sign in to label
            </Button>
          )}
          {isAuthenticated && !canLabel && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              This job is {job.status} — read only.
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default WorkbenchPage;
