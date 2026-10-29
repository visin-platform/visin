import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Stack } from '@mui/material';
import { NavigateBefore, Login } from '@mui/icons-material';
import { Loader, useChartColors } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getJob } from '../services/jobService';
import { JobClass } from '../types';
import { useWorkQueue } from '../editor/useWorkQueue';
import { useFrameDocument } from '../editor/useFrameDocument';
import { useEditorPrefs } from '../editor/useEditorPrefs';
import { useTabPresence } from '../editor/useTabPresence';
import ObjectList from '../editor/ObjectList';
import EditorCanvas, { EditorTool } from '../editor/EditorCanvas';
import ModelDialog from '../components/ModelDialog';
import ModelClassMappingDialog from '../components/ModelClassMappingDialog';
import { useLocalModel } from '../localModel/useLocalModel';
import EditorToolbar from '../editor/EditorToolbar';
import { Viewport } from '../editor/viewport';
import { usePageTitle } from '../hooks/usePageTitle';
import ShortcutsDialog from './workbench/ShortcutsDialog';
import WorkbenchDone from './workbench/WorkbenchDone';
import WorkbenchHeader from './workbench/WorkbenchHeader';
import { useWorkbenchKeys } from './workbench/useWorkbenchKeys';
import { useFrameBlob } from './workbench/useFrameBlob';
import { useSegmentTool } from './workbench/useSegmentTool';
import { useModelDetect } from './workbench/useModelDetect';

/** Gap left under the editor so the page itself never scrolls. */
const BOTTOM_GUTTER_PX = 8;

const WorkbenchPage: React.FC = () => {
  const { id: jobId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { adapt } = useChartColors();
  const { data: job, error: jobError } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });
  usePageTitle(job ? `Labeling ${job.name}` : 'Labeling');
  // Read once: the param is rewritten as the annotator advances, and re-reading
  // it would restart the queue on every frame.
  const [startTaskId] = useState(() => searchParams.get('task'));
  const [startBrowsing] = useState(() => searchParams.get('browse') === '1');
  // Pulling takes a lease, which needs a signed-in annotator and a job that is
  // actually taking labels; anyone else opens straight into browse mode.
  const canPull = isAuthenticated && job?.canLabel === true && job.status === 'active';
  // A completed job stopped handing out work, but its labels stay correctable.
  const canLabel = isAuthenticated && job?.canLabel === true && (job.status === 'active' || job.status === 'completed');
  const queue = useWorkQueue(jobId, { startTaskId, canPull, startBrowsing, enabled: Boolean(job) && !authLoading });

  const item = queue.current;
  const frame = useFrameDocument(item, { readOnly: !canLabel, independent: (job?.redundancy ?? 1) > 1 });
  const doc = frame.doc;

  const model = useLocalModel();
  const [modelOpen, setModelOpen] = useState(false);
  const [modelMappingOpen, setModelMappingOpen] = useState(false);
  const [prefs, setPrefs] = useEditorPrefs(jobId);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  // Take whatever vertical space is actually left below the app chrome, rather
  // than subtracting a guessed constant from 100vh.
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

  const classes = useMemo<JobClass[]>(() => job?.classes ?? [], [job]);
  const colorOf = useCallback((jobClass: JobClass) => adapt(jobClass.color), [adapt]);
  const canBox = classes.some((entry) => entry.tools.includes('box'));
  const canMask = classes.some((entry) => entry.tools.includes('mask'));

  // The segment tool exists only while a model that can segment is connected;
  // if it goes away mid-session the editor falls back to the box tool.
  const tool: EditorTool = prefs.tool === 'sam' && !model.canSegment ? 'box' : prefs.tool;

  // The class a new box or stroke is for: the last one chosen, if it still fits
  // the tool, otherwise the first class that does.
  const toolNeeds = tool === 'box' ? 'box' : 'mask';
  const activeClass =
    classes.find((entry) => entry.key === prefs.classKey && entry.tools.includes(toolNeeds)) ??
    classes.find((entry) => entry.tools.includes(toolNeeds)) ??
    null;

  const availableOverlays = useMemo(
    () => ({
      lidar: Boolean(item?.images.sensors.some((sensor) => sensor.key === 'lidar')),
      radar: Boolean(item?.images.sensors.some((sensor) => sensor.key === 'radar'))
    }),
    [item]
  );
  const overlays = {
    lidar: availableOverlays.lidar && prefs.overlays.lidar,
    radar: availableOverlays.radar && prefs.overlays.radar
  };

  // A new frame starts framed to fit.
  const taskId = item?.task._id ?? null;
  const openElsewhere = useTabPresence(canLabel ? taskId : null);
  useEffect(() => {
    setViewport(null);
    setActionError(null);
  }, [taskId]);

  const frameBlob = useFrameBlob(item);
  const { samPoints, samBox, samPreview, samBusy, samPrompt, clearSam, commitSam } = useSegmentTool({
    item,
    taskId,
    tool,
    model,
    doc,
    activeClass,
    frameBlob,
    onError: setActionError
  });
  const { detecting, detectMessage, setDetectMessage, runDetect } = useModelDetect({
    item,
    taskId,
    canLabel,
    classes,
    doc,
    model,
    frameBlob,
    setModelSuggestions: frame.setModelSuggestions,
    onError: setActionError
  });

  const chooseTool = useCallback(
    (tool: EditorTool) => {
      const needs = tool === 'box' ? 'box' : 'mask';
      if (!classes.some((entry) => entry.tools.includes(needs))) return;
      if (tool === 'sam' && !model.canSegment) return;
      if (tool !== 'sam') commitSam(false);
      setPrefs({ tool });
    },
    [classes, setPrefs, model.canSegment, commitSam]
  );

  const chooseClass = useCallback(
    (key: string) => {
      const picked = classes.find((entry) => entry.key === key);
      if (!picked) return;
      if (key !== activeClass?.key) commitSam(false);
      // Choosing a class that does not fit the current tool switches to one that does.
      const next: EditorTool = tool === 'box' && !picked.tools.includes('box') ? 'brush' : tool !== 'box' && !picked.tools.includes('mask') ? 'box' : tool;
      setPrefs({ classKey: key, tool: next });
      // With a box picked, the class change is for that box, not the next one.
      if (doc?.selectedId && picked.tools.includes('box')) doc.setBoxClass(doc.selectedId, key);
    },
    [classes, tool, setPrefs, doc, activeClass, commitSam]
  );

  // Keep the current frame in the URL, so an annotator with a question can copy
  // the address bar and have it open on the same frame for whoever they ask.
  // `replace`, so Back leaves the editor rather than walking the queue.
  useEffect(() => {
    if (!taskId) return;
    setLinkCopied(false);
    setSearchParams(
      (previous) => {
        if (previous.get('task') === taskId) return previous;
        const next = new URLSearchParams(previous);
        next.set('task', taskId);
        return next;
      },
      { replace: true }
    );
  }, [taskId, setSearchParams]);

  const copyFrameLink = useCallback(() => {
    const url = `${window.location.origin}${location.pathname}${location.search}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => setLinkCopied(true))
      .catch(() => setActionError('Could not copy the link — copy it from the address bar instead.'));
  }, [location.pathname, location.search]);

  const position = item?.position ?? null;
  const { flush, elapsedMs } = frame;

  /** Everything unsent goes first: a frame is never left with work only this tab holds. */
  const saveFirst = useCallback(async (): Promise<boolean> => {
    if (samBusy) {
      setActionError('Wait for the segment to finish, or switch tools to cancel it.');
      return false;
    }
    commitSam(false);
    const ok = await flush();
    if (!ok) setActionError('Your changes could not be sent yet. They are kept on this device and will go when the connection is back.');
    return ok;
  }, [flush, samBusy, commitSam]);

  const step = useCallback(
    async (delta: number) => {
      if (!position) return;
      const target = position.index + delta;
      if (target < 0 || target >= position.total) return;
      if (canLabel && !(await saveFirst())) return;
      queue.goTo(target).catch((err) => setActionError((err as Error).message));
    },
    [position, queue, canLabel, saveFirst]
  );

  const finish = useCallback(
    async (outcome: 'done' | 'skip') => {
      if (!canLabel || !item || queue.navigating) return;
      try {
        setActionError(null);
        if (outcome === 'done') frame.adoptCopy();
        if (!(await saveFirst())) return;
        await queue.finish(outcome, elapsedMs());
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [canLabel, item, queue, saveFirst, elapsedMs, frame]
  );

  const fit = useCallback(() => setViewport(null), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const toggleObjects = useCallback(() => setObjectsOpen((open) => !open), []);
  useWorkbenchKeys({
    hasFrame: Boolean(item),
    dialogOpen: helpOpen || modelOpen || modelMappingOpen,
    canLabel,
    doc,
    classes,
    tool,
    brushDiameter: prefs.brushDiameter,
    availableOverlays,
    overlays,
    samPreview,
    samBusy,
    step,
    finish,
    chooseTool,
    chooseClass,
    setPrefs,
    clearSam,
    commitSam,
    runDetect,
    acceptAllSuggestions: frame.acceptAllSuggestions,
    dismissSuggestions: frame.dismissSuggestions,
    onFit: fit,
    onHelp: openHelp,
    onToggleObjects: toggleObjects
  });

  if (jobError) return <Alert severity="error">{jobError.message}</Alert>;
  if (!job || queue.status === 'loading') {
    return <Loader message="Loading editor..." />;
  }
  if (queue.status === 'error') {
    return <Alert severity="error">{queue.error}</Alert>;
  }

  if (queue.status === 'done' || !item) {
    return (
      <WorkbenchDone
        jobId={jobId}
        hasFrames={(job.tasksCount || 0) > 0}
        sessionDone={queue.sessionDone}
        onReview={() => queue.goTo(0).catch((err) => setActionError((err as Error).message))}
      />
    );
  }

  const total = job.tasksCount || 0;
  const myDone = (job.progress?.myDone ?? 0) + queue.sessionDone;
  const finishedByMe = item.annotation.mine?.status === 'done';
  const suggestionCount = frame.suggestions?.boxes.length ?? 0;
  const hasSuggestedMask = Boolean(frame.suggestions?.mask);

  return (
    <Box
      ref={rootRef}
      sx={{ display: 'flex', flexDirection: 'column', height: availableHeight ?? 'calc(100vh - 120px)', minHeight: 480 }}
    >
      <WorkbenchHeader
        jobId={jobId}
        jobName={job.name}
        stratum={item.task.stratum}
        stem={item.images.frame.stem}
        linkCopied={linkCopied}
        onCopyLink={copyFrameLink}
        position={position}
        navigating={queue.navigating}
        onStep={(delta) => void step(delta)}
        onResumeQueue={
          queue.browsing && canPull
            ? async () => {
                if (canLabel && !(await saveFirst())) return;
                queue.resumeQueue().catch((err) => setActionError((err as Error).message));
              }
            : undefined
        }
        saveStatus={canLabel ? frame.saveStatus : undefined}
        done={myDone}
        total={total}
        onHelp={openHelp}
      />

      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1 }}>
          {actionError}
        </Alert>
      )}
      {detectMessage && <Alert severity="info" onClose={() => setDetectMessage(null)} sx={{ mb: 1 }}
        action={job.canManage ? <Button color="inherit" size="small" onClick={() => setModelMappingOpen(true)}>Class mappings</Button> : undefined}>
        {detectMessage}
      </Alert>}
      {frame.saveStatus === 'error' && frame.saveMessage && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {frame.saveMessage}
        </Alert>
      )}
      {openElsewhere && (
        <Alert severity="warning" sx={{ mb: 1, py: 0.25 }}>
          This frame is also open in another tab. Both save, and the last save wins — close one of them.
        </Alert>
      )}
      {frame.openedFrom === 'latest' && (
        <Alert severity="info" sx={{ mb: 1, py: 0.25 }}>
          Showing another annotator&apos;s labels for this frame. Editing them saves a copy as your own.
        </Alert>
      )}

      {canLabel && doc && (
        <Box sx={{ mb: 1 }}>
          <EditorToolbar
            doc={doc}
            classes={classes}
            colorOf={colorOf}
            tool={tool}
            onTool={chooseTool}
            canBox={canBox}
            canMask={canMask}
            activeClassKey={activeClass?.key ?? null}
            onClass={chooseClass}
            brushDiameter={prefs.brushDiameter}
            onBrushDiameter={(brushDiameter) => setPrefs({ brushDiameter })}
            maskOpacity={prefs.maskOpacity}
            onMaskOpacity={(maskOpacity) => setPrefs({ maskOpacity })}
            availableOverlays={availableOverlays}
            overlays={overlays}
            onOverlays={(next) => setPrefs({ overlays: next })}
            onFit={() => setViewport(null)}
            disabled={queue.navigating}
            model={{
              status: model.status,
              label:
                model.status === 'connected'
                  ? `Model · ${model.info?.device ?? 'connected'}`
                  : model.status === 'connecting'
                    ? 'Model · connecting…'
                    : model.status === 'unreachable'
                      ? 'Model · not reachable'
                      : 'Model',
              canDetect: model.canDetect,
              canSegment: model.canSegment,
              detecting,
              onDetect: () => void runDetect(true),
              onOpen: () => setModelOpen(true)
            }}
          />
        </Box>
      )}

      {(suggestionCount > 0 || hasSuggestedMask) && canLabel && (
        <Alert
          severity="info"
          icon={false}
          sx={{ mb: 1, py: 0.25 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={frame.acceptAllSuggestions}>
                Accept all (A)
              </Button>
              <Button size="small" color="inherit" onClick={frame.dismissSuggestions}>
                Dismiss (X)
              </Button>
            </Stack>
          }
        >
          {suggestionCount > 0 && `${suggestionCount} suggested ${suggestionCount === 1 ? 'box' : 'boxes'}`}
          {suggestionCount > 0 && hasSuggestedMask && ' and a mask'}
          {suggestionCount === 0 && hasSuggestedMask && 'A suggested mask'} — click a dashed box to accept it.
        </Alert>
      )}

      {tool === 'sam' && canLabel && (
        <Alert severity="info" icon={false} sx={{ mb: 1, py: 0.25 }}>
          {samBusy
            ? 'Segmenting…'
            : samPreview
              ? 'Enter keeps this mask · click more to add · right-click to take away · Esc starts over'
              : 'Click the object (right-click what is not it), or drag a box around it.'}
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, position: 'relative' }}>
          {frame.error ? (
            <Alert severity="error">{frame.error}</Alert>
          ) : !doc || frame.loading ? (
            <Loader message="Loading frame..." />
          ) : (
            <EditorCanvas
              doc={doc}
              images={item.images}
              classes={classes}
              colorOf={colorOf}
              tool={tool}
              activeClass={activeClass}
              brushRadius={prefs.brushDiameter / 2}
              maskOpacity={prefs.maskOpacity}
              overlays={overlays}
              suggestionBoxes={frame.suggestions?.boxes ?? []}
              suggestionMask={frame.suggestions?.mask ?? null}
              onAcceptSuggestion={frame.acceptSuggestion}
              readOnly={!canLabel}
              viewport={viewport}
              onViewportChange={setViewport}
              onPickClass={(key) => setPrefs({ classKey: key })}
              sam={
                tool === 'sam'
                  ? { points: samPoints, box: samBox, preview: samPreview, busy: samBusy, onPrompt: (points, box) => void samPrompt(points, box) }
                  : undefined
              }
            />
          )}
        </Box>
        {objectsOpen && doc && (
          <ObjectList doc={doc} classes={classes} colorOf={colorOf} readOnly={!canLabel} onClose={() => setObjectsOpen(false)} />
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
        {doc && (
          <Button size="small" color="inherit" onClick={() => setObjectsOpen((open) => !open)} aria-pressed={objectsOpen}>
            Objects ({doc.boxes.length}) <Box component="kbd" sx={{ ml: 0.75, opacity: 0.6 }}>O</Box>
          </Button>
        )}
        {canLabel ? (
          <>
            <Button
              startIcon={<NavigateBefore />}
              disabled={queue.navigating || position === null || position.index === 0}
              onClick={() => void step(-1)}
            >
              Back
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button disabled={queue.navigating || finishedByMe} onClick={() => void finish('skip')}>
              Skip (K)
            </Button>
            <Button variant="contained" size="large" disabled={queue.navigating || !doc} onClick={() => void finish('done')}>
              Done (Enter)
            </Button>
          </>
        ) : (
          <>
            <Box sx={{ flexGrow: 1 }} />
            {!isAuthenticated ? (
              <Button variant="contained" startIcon={<Login />} onClick={login}>
                Sign in to label
              </Button>
            ) : (
              <Alert severity="info" sx={{ py: 0.25 }}>
                This job is {job.status} — read only.
              </Alert>
            )}
          </>
        )}
      </Stack>

      <ModelDialog open={modelOpen} model={model} onClose={() => setModelOpen(false)}
        onConfigureClasses={job.canManage ? () => { setModelOpen(false); setModelMappingOpen(true); } : undefined} />
      {job.canManage && modelMappingOpen && <ModelClassMappingDialog jobId={jobId} classes={classes} modelClasses={model.info?.classes ?? []}
        onClose={() => setModelMappingOpen(false)} />}

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Box>
  );
};

export default WorkbenchPage;
