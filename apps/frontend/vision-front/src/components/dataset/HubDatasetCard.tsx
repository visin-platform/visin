import React, { useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Collapse, Link, Paper, Stack, Typography, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getHubInfo, listLicenses, type DatasetSource } from '../../services/datasetService';
import { formatBytes } from '../../utils/datasetMapping';
import { hubDatasetUrl, shortRevision } from '../../utils/hubLinks';

interface HubDatasetCardProps {
  datasetId: string;
  source: DatasetSource;
  /** the licence this dataset declares; the Hub card's is shown beside it, never copied over it */
  declaredLicenseId?: string;
  /** given to someone who may edit the dataset: declares the Hub card's licence as this dataset's */
  onUseLicense?: (licenseId: string) => void;
  busy?: boolean;
}

const FILES_SHOWN = 20;

/**
 * What the Hub says about this dataset's repo: licence, tags, size, and the
 * top-level folders, where the splits usually are. It is read from the Hub's own
 * API at the pinned commit and nothing is copied, so a private repo, which the
 * server cannot read, shows only why.
 */
const HubDatasetCard: React.FC<HubDatasetCardProps> = ({ datasetId, source, declaredLicenseId, onUseLicense, busy }) => {
  const [showFiles, setShowFiles] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dataset-hub', datasetId, source.repo, source.revision],
    queryFn: () => getHubInfo(datasetId),
    retry: false
  });
  // Only a licence Visin lists can be declared from the card; the Hub has others, and `other` says nothing.
  const listed = useQuery({ queryKey: ['dataset-licenses'], queryFn: listLicenses, staleTime: Infinity, enabled: Boolean(onUseLicense) });
  const hubLicense = data?.license?.toLowerCase();
  const usable = Boolean(hubLicense && hubLicense !== 'other' && listed.data?.some((choice) => choice.id === hubLicense));

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        On Hugging Face
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        <Link href={hubDatasetUrl(source)} target="_blank" rel="noopener noreferrer">
          {source.repo}
        </Link>{' '}
        at commit {shortRevision(source.revision)}. Read from the Hub; nothing is copied to Visin.
      </Typography>
      {isLoading && <CircularProgress size={24} />}
      {isError && <Alert severity="info">{error instanceof Error ? error.message : 'Could not read the Hub'}</Alert>}
      {data && (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            {data.license && <Chip size="small" label={`Hub card licence: ${data.license}`} />}
            {data.gated && <Chip size="small" color="warning" label="Gated: access must be requested" />}
            <Chip size="small" label={`${data.fileCount.toLocaleString()} files · ${formatBytes(data.totalBytes)}`} />
            {data.taskCategories?.map((task) => <Chip key={task} size="small" variant="outlined" label={task} />)}
            {data.sizeCategories?.map((size) => <Chip key={size} size="small" variant="outlined" label={size} />)}
            {data.tags.slice(0, 8).map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}
          </Stack>
          {hubLicense && hubLicense !== declaredLicenseId && (
            <Alert
              severity={declaredLicenseId ? 'warning' : 'info'}
              sx={{ mb: 2 }}
              action={
                onUseLicense && usable ? (
                  <Button color="inherit" size="small" disabled={busy} onClick={() => onUseLicense(hubLicense)}>
                    Declare this licence
                  </Button>
                ) : undefined
              }
            >
              {declaredLicenseId
                ? `The Hub card says ${data.license}, which differs from the licence declared for this dataset. Check which is right.`
                : `The Hub card says ${data.license}. Visin does not copy it for you: this dataset still has no declared licence.`}
            </Alert>
          )}
          {data.folders.length > 0 && (
            <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5 }} aria-label="Top-level folders">
              {data.folders.map((folder) => (
                <li key={folder.path}>
                  <Typography variant="body2">
                    <strong>{folder.path}</strong> · {folder.files.toLocaleString()} files · {formatBytes(folder.bytes)}
                  </Typography>
                </li>
              ))}
            </Box>
          )}
          {data.files.length > 0 && (
            <>
              <Button size="small" onClick={() => setShowFiles((open) => !open)}>
                {showFiles ? 'Hide files' : 'Show files'}
              </Button>
              <Collapse in={showFiles} unmountOnExit>
                <Box component="ul" sx={{ m: 0, pl: 2.5, fontFamily: 'monospace', fontSize: '0.8rem' }} aria-label="Files">
                  {data.files.slice(0, FILES_SHOWN).map((file) => (
                    <li key={file.path}>
                      {file.path}
                      {file.size !== undefined ? ` · ${formatBytes(file.size)}` : ''}
                    </li>
                  ))}
                </Box>
                {(data.truncated || data.files.length > FILES_SHOWN) && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    First {Math.min(FILES_SHOWN, data.files.length)} of {data.fileCount.toLocaleString()} files; the rest are on the Hub.
                  </Typography>
                )}
              </Collapse>
            </>
          )}
        </>
      )}
    </Paper>
  );
};

export default HubDatasetCard;
