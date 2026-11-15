import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Link, Stack } from '@mui/material';
import { Close, Download } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { attachmentUrls } from '../../services/attachmentUrls';
import type { Attachment } from '../../types/chat';

/** Only first-party stored files are rendered. URLs are minted after the server checks message visibility. */
export function MessageAttachments({ conversationId, files }: { conversationId: string; files: Attachment[] }) {
  const [preview, setPreview] = useState<Attachment>();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['chat-attachment-urls', conversationId, files.map((file) => file.fileId)],
    queryFn: async () => ({
      urls: await attachmentUrls(
        conversationId,
        files.map((file) => file.fileId)
      )
    }),
    // The addresses last an hour. Not re-signed on a timer: a new address would restart a video or voice message
    // that is playing. One that has run out fails to load, and is signed again then.
    staleTime: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1
  });
  // Files signed again after failing to load, and files that failed again after that. A file is signed again once per
  // failure: a fresh address cures an expired one, but one that fails anyway (a deleted file, an unreachable file
  // host) would otherwise be signed and reloaded without end, and each reload moves the whole thread up and down.
  const resigned = useRef(new Set<string>());
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const expired = (fileId: string) => {
    if (resigned.current.has(fileId)) {
      setBroken((previous) => new Set(previous).add(fileId));
      return;
    }
    resigned.current.add(fileId);
    void refetch();
  };
  const loaded = (fileId: string) => {
    resigned.current.delete(fileId);
    window.dispatchEvent(new Event('visin:chat-media-loaded'));
  };
  const retry = (fileId: string) => {
    resigned.current.add(fileId);
    setBroken((previous) => {
      const next = new Set(previous);
      next.delete(fileId);
      return next;
    });
    void refetch();
  };
  if (error)
    return (
      <Alert severity="warning" action={<Button onClick={() => void refetch()}>Retry</Button>}>
        Could not load attachments.
      </Alert>
    );
  return (
    <Stack spacing={1} sx={{ my: 0.5, maxWidth: '100%' }}>
      {files.map((file) => {
        const url = data?.urls[file.fileId];
        if (url && broken.has(file.fileId))
          return (
            <Box key={file.fileId} role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {file.name} · Could not load
              <Button size="small" onClick={() => retry(file.fileId)}>
                Retry
              </Button>
            </Box>
          );
        if (!url)
          return (
            <Box key={file.fileId} role="status">
              {file.name} · {isPending ? 'Loading…' : 'Unavailable'}
            </Box>
          );
        return (
          <Box key={file.fileId} sx={{ minWidth: 0 }}>
            {file.kind === 'image' ? (
              <Box
                component="button"
                aria-label={`View ${file.name}`}
                onClick={() => setPreview(file)}
                sx={{ display: 'block', border: 0, p: 0, bgcolor: 'transparent', cursor: 'zoom-in', maxWidth: '100%' }}
              >
                <Box
                  component="img"
                  src={url}
                  alt={file.name}
                  loading="lazy"
                  onLoad={() => loaded(file.fileId)}
                  onError={() => expired(file.fileId)}
                  sx={{ display: 'block', maxWidth: '100%', maxHeight: 360, borderRadius: 2, objectFit: 'contain' }}
                />
              </Box>
            ) : file.kind === 'video' ? (
              <Box
                component="video"
                src={url}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={() => loaded(file.fileId)}
                onError={() => expired(file.fileId)}
                aria-label={file.name}
                sx={{ display: 'block', maxWidth: '100%', maxHeight: 360, borderRadius: 2 }}
              />
            ) : file.kind === 'audio' ? (
              <Box
                component="audio"
                src={url}
                controls
                preload="metadata"
                onLoadedMetadata={() => resigned.current.delete(file.fileId)}
                onError={() => expired(file.fileId)}
                aria-label={`Voice message: ${file.name}`}
                sx={{ display: 'block', width: 280, maxWidth: '100%' }}
              />
            ) : (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                sx={{ display: 'flex', alignItems: 'center', gap: 1, overflowWrap: 'anywhere' }}
              >
                <Download fontSize="small" />
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </Link>
            )}
          </Box>
        );
      })}
      <Dialog open={Boolean(preview)} onClose={() => setPreview(undefined)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 7 }}>
          {preview?.name}
          <IconButton
            aria-label="Close image"
            onClick={() => setPreview(undefined)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {preview && (
            <Box
              component="img"
              src={data?.urls[preview.fileId]}
              alt={preview.name}
              sx={{ width: '100%', maxHeight: '80dvh', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
