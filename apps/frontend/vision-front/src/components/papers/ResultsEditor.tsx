import React, { useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, TextField, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import type { PaperResultKind } from '../../types/paper';
import { parseVisinLink } from '../../utils/visinLinks';

/** A result being cited: what it is, how to find it, and what the form knows of it (`name` once saved, `available`). */
export interface ResultDraft {
  kind: PaperResultKind;
  ref: string;
  note: string;
  name?: string;
  available?: boolean;
}

const KIND_LABEL: Record<PaperResultKind, string> = { project: 'Project', training: 'Run', leaderboard: 'Leaderboard' };
const MAX_RESULTS = 30;

interface ResultsEditorProps {
  value: ResultDraft[];
  onChange: (next: ResultDraft[]) => void;
  disabled?: boolean;
}

/**
 * Which results on Visin the paper rests on. Each is added by pasting its address from the app, which names a
 * project, a run or a leaderboard; the server then checks it exists and that the author may read it.
 */
const ResultsEditor: React.FC<ResultsEditorProps> = ({ value, onChange, disabled }) => {
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = () => {
    const parsed = parseVisinLink(link);
    if (!parsed) {
      setProblem('That is not the address of a Visin project, run or leaderboard.');
      return;
    }
    setProblem(null);
    setLink('');
    if (!value.some((result) => result.kind === parsed.kind && result.ref === parsed.ref)) {
      onChange([...value, { ...parsed, note: '' }]);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="subtitle2">Results on Visin</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Paste the address of a project, a run or a leaderboard that the paper’s numbers come from.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          label="Address of a Visin page"
          placeholder="https://…/projects/my-project"
          value={link}
          disabled={disabled || value.length >= MAX_RESULTS}
          onChange={(event) => {
            setLink(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          error={problem !== null}
          helperText={problem ?? ' '}
        />
        <Button variant="outlined" disabled={disabled || !link.trim()} onClick={add} sx={{ alignSelf: 'flex-start', height: 40 }}>
          Add
        </Button>
      </Box>
      {value.map((result) => (
        <Box key={`${result.kind}:${result.ref}`} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={KIND_LABEL[result.kind]} />
            <Typography sx={{ overflowWrap: 'anywhere' }}>{result.name ?? result.ref}</Typography>
            {result.available === false && <Chip size="small" color="warning" variant="outlined" label="Not public" />}
          </Box>
          <TextField
            size="small"
            label="Where used"
            placeholder="Table 2"
            value={result.note}
            disabled={disabled}
            onChange={(event) =>
              onChange(value.map((other) => (other === result ? { ...other, note: event.target.value } : other)))
            }
            slotProps={{ htmlInput: { maxLength: 200 } }}
            sx={{ width: { xs: 120, sm: 180 } }}
          />
          <IconButton aria-label={`Remove ${result.name ?? result.ref}`} size="small" disabled={disabled} onClick={() => onChange(value.filter((other) => other !== result))}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      ))}
      {value.some((result) => result.available === false) && (
        <Alert severity="info">A result that is not public is not shown to other people, and does not count towards publishing the paper.</Alert>
      )}
    </Box>
  );
};

export default ResultsEditor;
