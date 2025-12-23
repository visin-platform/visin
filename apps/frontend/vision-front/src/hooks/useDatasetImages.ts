import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getImagesByDataset, WeatherCondition } from '../services/datasetImageService';

interface UseDatasetImagesProps {
  datasetId: string;
  initialPageSize?: number;
}

export const useDatasetImages = ({ datasetId, initialPageSize = 50 }: UseDatasetImagesProps) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState({
    category: '',
    tags: [] as string[],
    weather: '' as WeatherCondition | ''
  });

  const query = useQuery({
    queryKey: ['datasetImages', datasetId, filters, page, pageSize],
    queryFn: () => getImagesByDataset(
      datasetId,
      page,
      pageSize,
      undefined,
      filters.category || undefined,
      filters.tags.length > 0 ? filters.tags.join(' ') : undefined,
      filters.weather || undefined,
      'updatedAt',
      'desc'
    ),
    enabled: Boolean(datasetId),
    placeholderData: keepPreviousData,
  });

  const updateFilter = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  return {
    ...query,
    page,
    setPage,
    pageSize,
    setPageSize,
    filters,
    updateFilter
  };
};
