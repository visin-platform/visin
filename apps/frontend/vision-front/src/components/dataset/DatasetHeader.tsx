import React from 'react';
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import {
  AccountTree as MappingIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Cloud as HubIcon,
  Edit as EditIcon,
  SwapHoriz as TransferIcon,
  UploadFile as UploadIcon
} from '@mui/icons-material';
import { OwnerChip, ShareButton, ResponsiveActions, type OwnerGroup } from '@visin/frontend-core';
import { datasetApiOrigin } from '../../config/datasetApi';
import type { Dataset } from '../../services/datasetService';
import { formatBytes } from '../../utils/datasetMapping';
import { hubDatasetUrl, shortRevision } from '../../utils/hubLinks';
import { formatDateTime } from '../../utils';
import LicenseChip from '../licensing/LicenseChip';
import type { DatasetDialogName } from './datasetDialogs';

interface DatasetHeaderProps {
  dataset: Dataset;
  userId?: string;
  ownerGroups: OwnerGroup[];
  /** The dataset whose zip is being downloaded, if any. */
  downloadingId: string | null;
  importing: boolean;
  scanning: boolean;
  /** An upload from this tab is running. */
  sending: boolean;
  /** Labeling jobs still use the dataset, which locks what would change its images. */
  held: boolean;
  heldReason?: string;
  onOpenDialog: (name: DatasetDialogName) => void;
  onDownload: (id: string) => void;
}

/** The dataset's name, what it holds and who owns it, with the actions its permissions allow. */
const DatasetHeader: React.FC<DatasetHeaderProps> = ({
  dataset,
  userId,
  ownerGroups,
  downloadingId,
  importing,
  scanning,
  sending,
  held,
  heldReason,
  onOpenDialog,
  onDownload
}) => (
  <>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' }, overflowWrap: 'anywhere' }}
            >
              {dataset.name}
            </Typography>
            {dataset.visibility === 'public' && datasetApiOrigin() && (
              <ShareButton url={`${datasetApiOrigin()}/api/datasets/share/${dataset._id}`} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {[
              dataset.archive
                ? `${dataset.archive.filename}${dataset.archive.size ? ` · ${formatBytes(dataset.archive.size)}` : ''}`
                : dataset.source
                  ? 'On Hugging Face'
                  : 'No zip uploaded',
              `${dataset.imageCount.toLocaleString()} images`,
              `updated ${formatDateTime(dataset.updatedAt)}`
            ].join(' · ')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <OwnerChip owner={dataset.owner} userId={userId} groups={ownerGroups} ownerName={dataset.owner.name} />
            <Chip size="small" label={dataset.visibility === 'public' ? 'Visible to everyone' : 'Private'} />
            {dataset.source && (
              <Chip
                size="small"
                icon={<HubIcon />}
                component="a"
                href={hubDatasetUrl(dataset.source)}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                label={`${dataset.source.repo} @ ${shortRevision(dataset.source.revision)}`}
              />
            )}
            <LicenseChip license={dataset.license} of="dataset" />
            {held && <Chip size="small" color="secondary" label={heldReason} />}
          </Stack>
          {dataset.credit && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, overflowWrap: 'anywhere' }}>
              Credit: {dataset.credit}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          <ResponsiveActions
            keepOnPhone={1}
            menuLabel={`More actions for ${dataset.name}`}
            actions={[
              ...(dataset.archive
                ? [
                    {
                      label: 'Download zip',
                      icon: downloadingId ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />,
                      onClick: () => onDownload(dataset._id),
                      disabled: Boolean(downloadingId),
                      primary: true
                    }
                  ]
                : []),
              ...(dataset.permissions.contribute
                ? [
                    {
                      label: 'Import image groups…',
                      icon: <MappingIcon />,
                      onClick: () => onOpenDialog('mapping'),
                      disabled: !dataset.contents || importing || scanning || sending || held
                    },
                    {
                      label: dataset.archive ? 'Replace zip' : 'Upload zip',
                      icon: <UploadIcon />,
                      onClick: () => onOpenDialog('replace'),
                      disabled: importing || scanning || sending || held
                    }
                  ]
                : []),
              ...(dataset.permissions.manage
                ? [
                    { label: 'Edit', icon: <EditIcon />, onClick: () => onOpenDialog('edit') },
                    { label: 'Hugging Face source', icon: <HubIcon />, onClick: () => onOpenDialog('source') }
                  ]
                : []),
              ...(dataset.permissions.own
                ? [
                    {
                      label: 'Transfer',
                      icon: <TransferIcon />,
                      onClick: () => onOpenDialog('transfer'),
                      disabled: sending
                    }
                  ]
                : []),
              ...(dataset.permissions.manage
                ? [
                    {
                      label: 'Move to trash',
                      icon: <DeleteIcon />,
                      onClick: () => onOpenDialog('delete'),
                      disabled: sending,
                      danger: true
                    }
                  ]
                : [])
            ]}
          />
        </Box>
      </Stack>
  </>
);

export default DatasetHeader;
