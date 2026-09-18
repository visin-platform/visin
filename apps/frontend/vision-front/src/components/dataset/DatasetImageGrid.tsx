import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardMedia,
  Chip,
  CircularProgress,
  Pagination,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { DatasetItem, listItems } from '../../services/datasetService';

const PAGE_SIZE = 60;

interface DatasetImageGridProps {
  datasetId: string;
  groups: { name: string; images: number }[];
  onOpen: (item: DatasetItem) => void;
}

/** A page of thumbnails, filterable by group and file name. */
const DatasetImageGrid: React.FC<DatasetImageGridProps> = ({ datasetId, groups, onOpen }) => {
  const imageGroups = groups.filter((group) => group.images > 0);
  const [group, setGroup] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce typing; a new filter starts from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dataset-items', datasetId, group, search, page],
    queryFn: () => listItems(datasetId, { kind: 'image', group, search: search || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    // Signed URLs last an hour; refetch well before a long-open page goes blank.
    staleTime: 30 * 60 * 1000
  });

  const selectGroup = (name?: string) => {
    setGroup(name);
    setPage(1);
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', flexGrow: 1 }}>
          <Chip label="All" color={group === undefined ? 'primary' : 'default'} onClick={() => selectGroup(undefined)} />
          {imageGroups.map((option) => (
            <Chip
              key={option.name}
              label={`${option.name} · ${option.images.toLocaleString()}`}
              color={group === option.name ? 'primary' : 'default'}
              onClick={() => selectGroup(option.name)}
            />
          ))}
        </Stack>
        <TextField size="small" label="Search file name" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
      </Stack>

      {error && <Alert severity="error">{error instanceof Error ? error.message : 'Could not load images'}</Alert>}
      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : data && data.items.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>No images match.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' },
            gap: 1.5,
            opacity: isFetching ? 0.6 : 1
          }}
        >
          {data?.items.map((item) => (
            <Card key={item._id} variant="outlined">
              <CardActionArea onClick={() => onOpen(item)}>
                <CardMedia component="img" image={item.thumbnailUrl} alt={item.path} loading="lazy" sx={{ height: 120, objectFit: 'cover', bgcolor: 'action.hover' }} />
                <Box sx={{ px: 1, py: 0.5 }}>
                  <Typography variant="caption" noWrap title={item.path} sx={{ display: 'block' }}>
                    {item.path.slice(item.path.lastIndexOf('/') + 1)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {item.group}
                    {item.variant ? ` · ${item.variant}` : ''}
                  </Typography>
                </Box>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
      {data && data.pagination.pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={data.pagination.pages} page={page} onChange={(_event, value) => setPage(value)} siblingCount={0} />
        </Box>
      )}
    </Box>
  );
};

export default DatasetImageGrid;
