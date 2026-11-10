import { AttachFile, Close, Mic, Stop } from '@mui/icons-material';
import { Alert, Box, Button, Chip, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { livePalette } from '@visin/frontend-core';
import { useVoiceRecorder, type VoiceRecording } from '../../hooks/useVoiceRecorder';
import { FILE_ACCEPT, uploadAttachment } from '../../services/attachmentUpload';
import { formatDuration } from '../../services/voice';
import type { AttachmentRef } from '../../types/chat';
import { Composer } from './Composer';

type Upload = {
  id: string;
  name: string;
  progress: number;
  attachment?: AttachmentRef;
  error?: string;
  controller: AbortController;
};

/** The message composer: files remain here after a failed send so retrying never loses a recording. */
export function MediaComposer({
  conversationId,
  filesEnabled,
  assistant = false,
  onSendFiles,
  voiceTarget,
  ...props
}: Omit<ComponentProps<typeof Composer>, 'onSend'> & {
  voiceTarget?: HTMLElement | null;
  conversationId: string;
  filesEnabled: boolean;
  assistant?: boolean;
  onSendFiles: (files: AttachmentRef[]) => Promise<boolean | void>;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const jobs = useRef(new Map<string, AbortController>());
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    const controllers = jobs.current;
    return () => {
      alive.current = false;
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);
  const patch = (id: string, changes: Partial<Upload>) => {
    if (alive.current) setUploads((rows) => rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };
  const add = (files: File[]) => {
    setProblem('');
    if (jobs.current.size + files.length > 5) {
      setProblem('A message can carry up to 5 files.');
      return;
    }
    for (const file of files) {
      const id = crypto.randomUUID();
      const controller = new AbortController();
      jobs.current.set(id, controller);
      setUploads((rows) => [...rows, { id, name: file.name, progress: 0, controller }]);
      void uploadAttachment(conversationId, file, controller.signal, (progress) => patch(id, { progress }))
        .then((attachment) => patch(id, { attachment, progress: 100 }))
        .catch((error: Error) => {
          if (!controller.signal.aborted) patch(id, { error: error.message });
        });
    }
  };
  const holdRecording = (recording: VoiceRecording) =>
    add([new File([recording.blob], recording.format.filename, { type: recording.format.mimetype })]);
  const voice = useVoiceRecorder(holdRecording);
  const recording = voice.state !== 'idle';
  const busy = uploads.some((row) => !row.attachment && !row.error);
  const blocked = props.disabled || props.sending;
  const cancelRecording = voice.cancel;
  useEffect(() => {
    if (blocked || !filesEnabled) cancelRecording();
  }, [blocked, filesEnabled, cancelRecording]);
  const accepting = filesEnabled && !blocked && !recording;
  const [dropping, setDropping] = useState(false);
  /** Files pasted (a screenshot from the clipboard) or dropped on the composer, as if chosen with the paperclip. */
  const filesFrom = (data: DataTransfer | null) => Array.from(data?.files ?? []);
  const send = async () => {
    if (submitting.current || blocked || busy || recording || uploads.some((row) => row.error)) return;
    submitting.current = true;
    try {
      const sent = await onSendFiles(uploads.flatMap((row) => (row.attachment ? [row.attachment] : [])));
      if (sent && alive.current) {
        setUploads([]);
        jobs.current.clear();
      }
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Box
      onPaste={(event) => {
        const files = filesFrom(event.clipboardData);
        if (!accepting || files.length === 0) return;
        event.preventDefault();
        add(files);
      }}
      onDragOver={(event) => {
        if (!accepting || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const files = filesFrom(event.dataTransfer);
        if (!accepting || files.length === 0) return;
        event.preventDefault();
        add(files);
      }}
      sx={(theme) => ({
        position: 'relative',
        ...(dropping && { outline: `2px dashed ${livePalette(theme).primary.main}`, outlineOffset: -4 })
      })}
    >
      {dropping && (
        <Typography
          role="status"
          variant="caption"
          sx={{ position: 'absolute', top: 8, right: 16, color: 'primary.main' }}
        >
          Drop to attach
        </Typography>
      )}
      {voiceTarget &&
        createPortal(
          filesEnabled && !assistant && voice.supported ? (
            <Tooltip title="Record a voice message">
              <span>
                <IconButton
                  aria-label="Record voice message"
                  disabled={Boolean(blocked || recording || busy || uploads.length >= 5)}
                  onClick={() => void voice.start()}
                >
                  <Mic />
                </IconButton>
              </span>
            </Tooltip>
          ) : undefined,
          voiceTarget
        )}
      {(problem || voice.error) && (
        <Alert severity="warning" onClose={problem ? () => setProblem('') : undefined}>
          {problem || voice.error}
        </Alert>
      )}
      {assistant && uploads.some((row) => !/\.(png|jpe?g|gif|webp)$/i.test(row.name)) && (
        <Alert severity="info">
          Vivi analyzes attached images. Other file types are saved in this chat but cannot be read yet.
        </Alert>
      )}
      {uploads.length > 0 && (
        <Stack spacing={0.5} sx={{ px: 1.5, pt: 1 }}>
          {uploads.map((row) => (
            <Box key={row.id}>
              <Chip
                label={
                  row.error ? `${row.name}: ${row.error}` : `${row.name}${row.attachment ? '' : ` · ${row.progress}%`}`
                }
                color={row.error ? 'error' : 'default'}
                disabled={Boolean(props.sending)}
                onDelete={() => {
                  row.controller.abort();
                  jobs.current.delete(row.id);
                  setUploads((rows) => rows.filter((item) => item.id !== row.id));
                }}
                sx={{ maxWidth: '100%' }}
              />
              {!row.attachment && !row.error && (
                <LinearProgress variant="determinate" value={row.progress} aria-label={`Uploading ${row.name}`} />
              )}
            </Box>
          ))}
        </Stack>
      )}
      {recording && (
        <Stack direction="row" sx={{ px: 1.5, pt: 1, alignItems: 'center', gap: 1 }}>
          <Typography role="status" variant="body2">
            {voice.state === 'starting' ? 'Waiting for microphone…' : `Recording ${formatDuration(voice.elapsedMs)}`}
          </Typography>
          <Stack
            direction="row"
            aria-hidden
            sx={{ alignItems: 'center', gap: '2px', height: 24, flex: 1, minWidth: 0, overflow: 'hidden' }}
          >
            {voice.levels.map((level, index) => (
              <Box
                key={index}
                sx={{
                  width: 3,
                  flexShrink: 0,
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                  height: `${Math.max(12, Math.round(level * 100))}%`
                }}
              />
            ))}
          </Stack>
          <Button
            startIcon={<Stop />}
            disabled={voice.state === 'starting'}
            onClick={() => void voice.stop().then((result) => result && holdRecording(result))}
          >
            Finish
          </Button>
          <IconButton aria-label="Discard recording" onClick={voice.cancel}>
            <Close />
          </IconButton>
        </Stack>
      )}
      <Composer
        {...props}
        onSend={() => void send()}
        sending={props.sending || busy || recording || uploads.some((row) => Boolean(row.error))}
        hasAttachments={uploads.some((row) => Boolean(row.attachment))}
        dictation={assistant || !filesEnabled}
        leading={
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              aria-label="Choose attachments"
              hidden
              onChange={(event) => {
                add(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <Tooltip
              title={filesEnabled ? 'Attach photos, videos or files' : 'File uploads are not configured on this server'}
            >
              <span>
                <IconButton
                  aria-label="Attach files"
                  disabled={Boolean(!filesEnabled || blocked || recording)}
                  onClick={() => input.current?.click()}
                >
                  <AttachFile />
                </IconButton>
              </span>
            </Tooltip>
          </>
        }
      />
    </Box>
  );
}
