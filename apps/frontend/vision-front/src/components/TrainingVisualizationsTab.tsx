import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Paper,
  Pagination
} from '@mui/material';
import {
  Upload as UploadIcon,
  CompareArrows as CompareIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import { Epoch, Visualization } from '../types';
import { useTrainingVisualizations } from '../hooks/useTrainingVisualizations';
import VisualizationFilters from './visualizations/VisualizationFilters';
import VisualizationGrid from './visualizations/VisualizationGrid';
import UploadVisualizationDialog from './visualizations/UploadVisualizationDialog';
import CompareVisualizationsDialog from './visualizations/CompareVisualizationsDialog';
import ImageViewDialog from './visualizations/ImageViewDialog';
import type { ModelReference, Training } from '../types/training';
import { outputClassesOf } from '../providers/visin';
import { describeEmpty } from '../utils/trainingStatus';
import { useScreenAction } from '../hooks/useScreenAction';

interface TrainingVisualizationsTabProps {
  training_uuid: string;
  epochs: Epoch[];
  isAuthenticated: boolean;
  /** the run these belong to, so an empty tab can say why */
  run?: Pick<Training, 'status' | 'lastSeenAt' | 'kind'>;
  /** the run's models, whose weights name the classes its masks index */
  models?: ModelReference[];
}

const TrainingVisualizationsTab: React.FC<TrainingVisualizationsTabProps> = ({
  training_uuid,
  epochs,
  isAuthenticated,
  run,
  models
}) => {
  const classes = useMemo(() => outputClassesOf(models), [models]);
  // An inference run's points are numbered by the frames done.
  const pointLabel = run?.kind === 'inference' ? 'Frames done' : 'Epoch';
  const {
    visualizations,
    loading,
    error,
    setError,
    selectedType,
    setSelectedType,
    selectedEpochFilter,
    setSelectedEpochFilter,
    selectedImageName,
    setSelectedImageName,
    types,
    page,
    setPage,
    pages,
    total,
    uploading,
    handleUpload,
    handleDelete
  } = useTrainingVisualizations({ training_uuid });

  const isSet = (filter: string) => filter !== '' && filter !== 'all';
  const filtered = [selectedType, selectedEpochFilter, selectedImageName].some(isSet);
  const empty = describeEmpty('visualizations', run);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Visualization[]>([]);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);

  // The open image is in the address (`frame=`), so a link to it opens it, and the chat beside the page can tell the
  // analyst exactly which frame is on screen. Replaced rather than pushed: opening and closing pictures is not a
  // trail of pages to go back through.
  const [searchParams, setSearchParams] = useSearchParams();
  const frameInAddress = searchParams.get('frame');
  const shown = useRef<string | null>(null);
  const setFrameInAddress = useCallback(
    (uuid: string | null) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (uuid) next.set('frame', uuid);
          else next.delete('frame');
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const openFrame = useCallback(
    (viz: Visualization) => {
      shown.current = viz.visualization_uuid;
      setSelectedImage(viz);
      setImageDialogOpen(true);
      setFrameInAddress(viz.visualization_uuid);
    },
    [setFrameInAddress]
  );
  const closeFrame = () => {
    shown.current = null;
    setImageDialogOpen(false);
    setFrameInAddress(null);
  };
  // An address that names a frame opens it once that frame has loaded.
  useEffect(() => {
    if (!frameInAddress || shown.current === frameInAddress) return;
    const viz = visualizations.find((candidate) => candidate.visualization_uuid === frameInAddress);
    if (!viz) return;
    shown.current = frameInAddress;
    setSelectedImage(viz);
    setImageDialogOpen(true);
  }, [frameInAddress, visualizations]);

  useScreenAction(visualizations.map((viz) => viz.visualization_uuid), (id) => {
    const frame = visualizations.find((viz) => viz.visualization_uuid === id);
    if (!frame) return { ok: false, summary: 'That frame is no longer loaded' };
    openFrame(frame);
    return { ok: true, summary: `Opened frame ${id}` };
  }, visualizations.map((viz) => viz.filename || viz.visualization_uuid));

  // Handle compare selection
  const handleCompareToggle = (viz: Visualization) => {
    setSelectedForCompare(prev => {
      const exists = prev.find(v => v.visualization_uuid === viz.visualization_uuid);
      if (exists) {
        return prev.filter(v => v.visualization_uuid !== viz.visualization_uuid);
      } else if (prev.length < 4) {
        return [...prev, viz];
      } else {
        return prev;
      }
    });
  };

  // Handle image click
  const handleImageClick = (viz: Visualization) => openFrame(viz);

  return (
    <Box>
      {/* Header Actions */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3
        }}>
        <Typography variant="h6" sx={{
          fontWeight: "bold"
        }}>
          Visualizations
        </Typography>
        <Stack direction="row" spacing={2}>
          {selectedForCompare.length >= 2 && (
            <Button
              variant="outlined"
              startIcon={<CompareIcon />}
              onClick={() => setCompareDialogOpen(true)}
            >
              Compare ({selectedForCompare.length})
            </Button>
          )}
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload New
            </Button>
          )}
        </Stack>
      </Box>
      {/* Filters */}
      <VisualizationFilters
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        types={types}
        selectedEpochFilter={selectedEpochFilter}
        setSelectedEpochFilter={setSelectedEpochFilter}
        epochs={epochs}
        selectedImageName={selectedImageName}
        setSelectedImageName={setSelectedImageName}
        selectedForCompare={selectedForCompare}
        setSelectedForCompare={setSelectedForCompare}
        pointLabel={pointLabel}
      />
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {/* Loading State */}
      {loading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 8
          }}>
          <CircularProgress />
        </Box>
      )}
      {/* Visualizations Grid */}
      {!loading && visualizations.length === 0 && (
        <Paper 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            p: 6, 
            textAlign: 'center', 
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <ImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" gutterBottom sx={{
            color: "text.secondary"
          }}>
            {filtered ? 'No visualizations match these filters' : empty.title}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
            {filtered ? 'Try adjusting your filters.' : empty.body}{isAuthenticated && ' You can also upload a visualization yourself.'}
          </Typography>
          {isAuthenticated && (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload Visualization
            </Button>
          )}
        </Paper>
      )}
      {!loading && visualizations.length > 0 && (
        <VisualizationGrid
          visualizations={visualizations}
          selectedForCompare={selectedForCompare}
          handleCompareToggle={handleCompareToggle}
          handleImageClick={handleImageClick}
          handleDelete={handleDelete}
          isAuthenticated={isAuthenticated}
          classes={classes}
          pointLabel={pointLabel}
        />
      )}
      {!loading && pages > 1 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {total.toLocaleString()} images
          </Typography>
          <Pagination count={pages} page={page} onChange={(_event, next) => setPage(next)} aria-label="Visualization pages" />
        </Box>
      )}
      {/* Upload Dialog */}
      <UploadVisualizationDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        epochs={epochs}
        onUpload={handleUpload}
        uploading={uploading}
      />
      {/* Compare Dialog */}
      <CompareVisualizationsDialog
        open={compareDialogOpen}
        onClose={() => setCompareDialogOpen(false)}
        selectedForCompare={selectedForCompare}
        classes={classes}
      />
      {/* Image View Dialog */}
      <ImageViewDialog
        open={imageDialogOpen}
        onClose={closeFrame}
        selectedImage={selectedImage}
        classes={classes}
      />
    </Box>
  );
};

export default TrainingVisualizationsTab;
