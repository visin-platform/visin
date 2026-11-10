import React from 'react';
import { Alert, Box, Button, Skeleton, Typography } from '@mui/material';
import { Download, OpenInNew, Refresh } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePaperDocument } from '../../hooks/usePaperDocument';
import { paperService } from '../../services/paperService';

/** An address for a blob while it is shown, released when it is replaced or the page is left. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    if (!blob) return undefined;
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(undefined);
    };
  }, [blob]);
  return url;
}

interface PaperReaderProps {
  paperId: string;
  title: string;
  /** whoever manages the paper may have its PDF read again */
  canManage: boolean;
  /** where the PDF came from, for a link out when it cannot be shown here */
  sourceUrl?: string;
}

/**
 * The paper's PDF, shown in place from Visin's own copy. The copy is made when the paper's PDF address is saved (it is
 * read for its text at the same time, which is what lets the analyst search it), so this is a short wait the first time
 * and instant after. When it cannot be read the reader says why and still links to the source.
 */
const PaperReader: React.FC<PaperReaderProps> = ({ paperId, title, canManage, sourceUrl }) => {
  const queryClient = useQueryClient();
  const documentState = usePaperDocument(paperId);
  const state = documentState.data;
  const pdf = useQuery({
    queryKey: ['papers', 'pdf', paperId, state?.pageCount],
    queryFn: () => paperService.pdf(paperId),
    enabled: state?.viewable === true,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: 1
  });
  const url = useObjectUrl(pdf.data);
  const again = useMutation({
    mutationFn: () => paperService.refreshDocument(paperId),
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: ['papers', 'pdf', paperId], refetchType: 'none' });
      queryClient.setQueryData(['papers', 'document', paperId], next);
    }
  });

  if (documentState.isLoading || state?.status === 'pending') {
    return (
      <Box role="status" aria-busy="true" aria-label="Reading the paper’s PDF">
        <Skeleton variant="rounded" height={560} />
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
          Reading the PDF. This takes a few seconds the first time.
        </Typography>
      </Box>
    );
  }
  if (documentState.isError) {
    return (
      <Alert severity="warning" action={<Button size="small" onClick={() => documentState.refetch()}>Try again</Button>}>
        Could not load the PDF status.
      </Alert>
    );
  }
  if (!state || state.status === 'none') return null;

  const source = sourceUrl ? (
    <Button
      size="small"
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      endIcon={<OpenInNew fontSize="small" />}
    >
      Open the original
    </Button>
  ) : null;

  if (state.status === 'failed') {
    return (
      <Alert
        severity="warning"
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {source}
            {canManage && (
              <Button size="small" startIcon={<Refresh />} disabled={again.isPending} onClick={() => again.mutate()}>
                Try again
              </Button>
            )}
          </Box>
        }
      >
        The PDF could not be shown here{state.error ? `: ${state.error}` : ''}.
        {!canManage && ' The paper’s owner can fix its PDF address.'}
        {again.isError && ' Could not retry. Please try again.'}
      </Alert>
    );
  }

  if (pdf.isError) {
    return (
      <Alert severity="warning" action={source}>
        Could not load the PDF. Check your connection and reload the page.
      </Alert>
    );
  }

  return (
    <Box component="section" aria-label={`PDF of ${title}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}>
          {state.pageCount ? `${state.pageCount} pages` : 'PDF'}
          {state.truncated ? ' · the text of the later pages is not searchable' : ''}
        </Typography>
        {url && (
          <>
            <Button
              size="small"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNew fontSize="small" />}
            >
              Full screen
            </Button>
            <Button
              size="small"
              href={url}
              download={`${title.slice(0, 80)}.pdf`}
              startIcon={<Download fontSize="small" />}
            >
              Download
            </Button>
          </>
        )}
        {canManage && (
          <Button
            size="small"
            startIcon={<Refresh fontSize="small" />}
            disabled={again.isPending}
            onClick={() => again.mutate()}
          >
            Read again
          </Button>
        )}
      </Box>
      {again.isError && <Alert severity="warning" sx={{ mb: 1 }}>Could not read the PDF again. Please try again.</Alert>}
      {url ? (
        <Box
          component="iframe"
          title={`PDF of ${title}`}
          src={`${url}#view=FitH`}
          sx={{
            display: 'block',
            width: '100%',
            height: { xs: '70dvh', md: 'calc(100dvh - 220px)' },
            minHeight: 420,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper'
          }}
        />
      ) : (
        <Skeleton variant="rounded" height={560} aria-label="Loading the PDF" />
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
        Phone browsers may show only the first page here: use Full screen.
      </Typography>
    </Box>
  );
};

export default PaperReader;
