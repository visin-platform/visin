import React, { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { DatasetItem, listItems } from '../../services/datasetService';

interface DatasetItemDialogProps {
  datasetId: string;
  item: DatasetItem | null;
  onClose: () => void;
}

const labelFor = (item: DatasetItem): string => `${item.group}${item.variant ? ` · ${item.variant}` : ''}`;

/**
 * Everything recorded about one frame: every image that shares its stem, across
 * groups (the camera frame, its annotation overlay, its id map), plus any JSON
 * sidecars, shown as they are.
 */
const DatasetItemDialog: React.FC<DatasetItemDialogProps> = ({ datasetId, item, onClose }) => {
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
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', display: 'block', mb: 2 }}>
                {selected.path}
                {selected.width && selected.height ? ` · ${selected.width}×${selected.height}` : ''}
              </Typography>
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
