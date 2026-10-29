import React from 'react';
import { Link } from 'react-router-dom';
import { Chip, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { ArrowBack, KeyboardOutlined, LinkOutlined, NavigateBefore, NavigateNext, PlaylistPlay } from '@mui/icons-material';
import type { SaveStatus } from '../../editor/autosave';

const savedLabel = (status: SaveStatus): string =>
  status === 'saving' ? 'Saving…' : status === 'offline' ? 'Offline — kept on this device' : status === 'error' ? 'Could not save' : 'Saved';

interface WorkbenchHeaderProps {
  jobId: string;
  jobName: string;
  stratum?: string;
  /** The frame's file stem; the chip that copies its link. */
  stem?: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  position: { index: number; total: number } | null;
  navigating: boolean;
  onStep: (delta: number) => void;
  /** Shown while browsing in a job that is handing out work: back to the queue. */
  onResumeQueue?: () => void;
  /** Left out when the annotator cannot label, since nothing is saved then. */
  saveStatus?: SaveStatus;
  done: number;
  total: number;
  onHelp: () => void;
}

/** The editor's top bar: back, which frame this is, stepping, saving and progress. */
const WorkbenchHeader: React.FC<WorkbenchHeaderProps> = ({
  jobId,
  jobName,
  stratum,
  stem,
  linkCopied,
  onCopyLink,
  position,
  navigating,
  onStep,
  onResumeQueue,
  saveStatus,
  done,
  total,
  onHelp
}) => (
  <>
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
      <IconButton component={Link} to={`/jobs/${jobId}`} aria-label="back to job" size="small">
        <ArrowBack />
      </IconButton>
      <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>
        {jobName}
      </Typography>
      {stratum && <Chip size="small" label={stratum} />}
      {stem && (
        <Tooltip title={linkCopied ? 'Link copied' : 'Copy a link to this frame'}>
          <Chip
            size="small"
            variant="outlined"
            icon={<LinkOutlined />}
            label={stem}
            onClick={onCopyLink}
            color={linkCopied ? 'success' : 'default'}
          />
        </Tooltip>
      )}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Tooltip title="Previous frame (←)">
          <span>
            <IconButton
              aria-label="previous frame"
              size="small"
              disabled={navigating || position === null || position.index === 0}
              onClick={() => onStep(-1)}
            >
              <NavigateBefore />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 84, textAlign: 'center' }}>
          {position ? `${position.index + 1} / ${position.total}` : '—'}
        </Typography>
        <Tooltip title="Next frame (→)">
          <span>
            <IconButton
              aria-label="next frame"
              size="small"
              disabled={navigating || position === null || position.index + 1 >= position.total}
              onClick={() => onStep(1)}
            >
              <NavigateNext />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {onResumeQueue && (
        <Tooltip title="Stop browsing and take the next unlabeled frame">
          <span>
            <IconButton aria-label="resume queue" size="small" disabled={navigating} onClick={onResumeQueue}>
              <PlaylistPlay />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {saveStatus && (
        <Chip
          size="small"
          data-testid="save-status"
          color={saveStatus === 'offline' || saveStatus === 'error' ? 'warning' : 'default'}
          variant="outlined"
          label={savedLabel(saveStatus)}
        />
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {done}/{total}
      </Typography>
      <Tooltip title="Keyboard shortcuts (?)">
        <IconButton size="small" aria-label="keyboard shortcuts" onClick={onHelp}>
          <KeyboardOutlined />
        </IconButton>
      </Tooltip>
    </Stack>
    <LinearProgress variant="determinate" value={total ? Math.min(100, (done / total) * 100) : 0} sx={{ mb: 1 }} />
  </>
);

export default WorkbenchHeader;
