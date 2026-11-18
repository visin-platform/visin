import React from 'react';
import { Alert, Box, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { listItems } from '../../services/datasetService';
import type { JudgeDisagreement } from '../../types/evaluation';
import { sampleBox, sampleFrame } from './judgeCropGeometry';

const JudgeCrop: React.FC<{ sample: JudgeDisagreement; datasetId: string; group: string }> = ({ sample, datasetId, group }) => {
  const box = React.useMemo(() => sampleBox(sample.attrs.bbox), [sample.attrs.bbox]);
  const frame = sampleFrame(sample);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [imageError, setImageError] = React.useState<string>();
  const { data, error, isLoading } = useQuery({
    queryKey: ['judge-frame', datasetId, group, frame],
    queryFn: () => listItems(datasetId, { group, kind: 'image', stem: frame, limit: 20 }),
    enabled: Boolean(datasetId && group && frame && box),
    staleTime: 30 * 60 * 1000
  });
  const images = data?.items.filter(item => item.kind === 'image' && item.stem === frame && !item.variant) ?? [];
  const item = images.length === 1 ? images[0] : undefined;

  React.useEffect(() => {
    setImageError(undefined);
    if (!item?.url || !box || !canvas.current) return;
    const image = new Image();
    image.onload = () => {
      const [left, top, right, bottom] = box;
      if (right > image.naturalWidth || bottom > image.naturalHeight) {
        setImageError('The bounding box is outside the image.');
        return;
      }
      const target = canvas.current;
      const context = target?.getContext('2d');
      if (!target || !context) { setImageError('The crop could not be drawn.'); return; }
      const width = right - left, height = bottom - top, scale = Math.min(1, 512 / Math.max(width, height));
      target.width = Math.max(1, Math.round(width * scale));
      target.height = Math.max(1, Math.round(height * scale));
      context.drawImage(image, left, top, width, height, 0, 0, target.width, target.height);
    };
    image.onerror = () => setImageError('The frame could not be loaded.');
    image.src = item.url;
    return () => { image.onload = null; image.onerror = null; };
  }, [item?.url, box]);

  if (!box) return <Alert severity="info">No valid original-image bounding box was recorded.</Alert>;
  if (!datasetId || !group) return <Alert severity="info">Choose an image dataset and group to see this crop.</Alert>;
  if (isLoading) return <Skeleton variant="rounded" height={120} aria-label="Loading crop" />;
  if (error) return <Alert severity="warning">The frame could not be looked up.</Alert>;
  if (!item?.url) return <Alert severity="info">{images.length > 1 ? 'More than one image matches this frame.' : 'This frame is not available in the selected image group.'}</Alert>;
  return <Box>{imageError ? <Alert severity="warning">{imageError}</Alert> : null}<Box component="canvas" ref={canvas} role="img" aria-label={`Crop for ${sample.id}`} sx={{ display: imageError ? 'none' : 'block', maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} /></Box>;
};

export default JudgeCrop;
