import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { Close as CloseIcon, Image as CoverIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { DatasetItem, listItems } from '../../services/datasetService';

interface DatasetItemDialogProps {
  datasetId: string;
  item: DatasetItem | null;
  onClose: () => void;
  /** offered when the viewer can change the dataset: show the open image on its card */
  cover?: {
    path?: string;
    busy: boolean;
    onChange: (item: DatasetItem | null) => void;
  };
}

const labelFor = (item: DatasetItem): string => `${item.group}${item.variant ? ` · ${item.variant}` : ''}`;

/**
 * Everything recorded about one frame: every image that shares its stem, across
 * groups (the camera frame, its annotation overlay, its id map), plus any JSON
 * sidecars, shown as they are.
 */
const DatasetItemDialog: React.FC<DatasetItemDialogProps> = ({ datasetId, item, onClose, cover }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(item?._id ?? null), [item]);

  const { data, isLoading } = useQuery({
    queryKey: ['dataset-stem', datasetId, item?.stem],
    queryFn: () => listItems(datasetId, { stem: item!.stem, limit: 200 }),
    enabled: Boolean(item)
  });
  const related = data?.items ?? [];
  const images = related.filter((entry) => entry.kind === 'image');
  const sidecars = related.filter((entry) => entry.kind === 'json');
  const selected = images.find((entry) => entry._id === selectedId) ?? images[0];

  return (
    <Dialog open={Boolean(item)} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="span" variant="h6" sx={{ fontFamily: 'monospace' }}>
          {item?.stem}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }}>
              {images.map((entry) => (
                <Chip
                  key={entry._id}
                  label={labelFor(entry)}
                  color={entry._id === selected?._id ? 'primary' : 'default'}
                  onClick={() => setSelectedId(entry._id)}
                />
              ))}
            </Stack>
            {selected && (
              <Box sx={{ bgcolor: 'grey.900', borderRadius: 1, display: 'flex', justifyContent: 'center', mb: 1 }}>
                <Box component="img" src={selected.url} alt={selected.path} sx={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
              </Box>
            )}
            {selected && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {selected.path}
                  {selected.width && selected.height ? ` · ${selected.width}×${selected.height}` : ''}
                </Typography>
                {cover &&
                  (cover.path === selected.path ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                      <Chip size="small" color="primary" icon={<CoverIcon />} label="Dataset cover" />
                      <Button size="small" onClick={() => cover.onChange(null)} disabled={cover.busy}>
                        Pick automatically
                      </Button>
                    </Stack>
                  ) : (
                    <Button size="small" variant="outlined" startIcon={<CoverIcon />} onClick={() => cover.onChange(selected)} disabled={cover.busy} sx={{ flexShrink: 0 }}>
                      Use as cover
                    </Button>
                  ))}
              </Stack>
            )}
            {sidecars.map((entry) => (
              <Box key={entry._id} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                  {entry.path}
                </Typography>
                <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, maxHeight: 320, overflow: 'auto', fontSize: '0.75rem' }}>
                  {JSON.stringify(entry.data, null, 2)}
                </Box>
              </Box>
            ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DatasetItemDialog;
