import React, { useMemo, useState } from 'react';
import { useCompactLayout, ConfirmDialog, ListSkeleton } from '@visin/frontend-core';
import { MobileListRow } from '../common/MobileList';
import {
  Box,
  Typography,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { formatDateTime } from '../../utils';
import { benchmarkService } from '../../services/benchmarkService';
import { Benchmark, BenchmarksPaginatedResponse, BenchmarkResult } from '../../types';

const formatParameters = (res: BenchmarkResult | null) => {
  if (!res) return '-';
  // Prefer explicit million field if present
  if (res.total_parameters_m !== undefined && res.total_parameters_m !== null) {
    return `${Number(res.total_parameters_m).toFixed(1)}M`;
  }
  const paramVal = res.parameters ?? res.total_parameters ?? res.trainable_parameters;
  if (paramVal !== undefined && paramVal !== null) {
    const num = Number(paramVal);
    if (Number.isFinite(num)) return `${(num / 1e6).toFixed(1)}M`;
  }
  return '-';
};

const formatFps = (res: BenchmarkResult | null) =>
  res?.fps !== undefined && res?.fps !== null ? res.fps.toFixed(2) : '-';

interface ProjectBenchmarksTabProps {
  /** Every benchmark of the project the page loaded, up to its cap. */
  benchmarksResponse: BenchmarksPaginatedResponse | undefined;
  isLoading: boolean;
  isOwner: boolean;
}

/** What a benchmark ran on: the GPU, else the CPU, else the device its result names. */
const deviceOf = (benchmark: Benchmark): string => {
  const result = benchmark.results?.[0];
  const info = benchmark.system_info;
  return (
    info?.gpu_name?.trim() ||
    info?.cpu?.trim() ||
    (typeof result?.device === 'string' ? result.device.trim() : '') ||
    'Unknown device'
  );
};

const fpsOf = (benchmark: Benchmark): number | undefined => {
  const fps = benchmark.results?.[0]?.fps;
  return typeof fps === 'number' && Number.isFinite(fps) ? fps : undefined;
};

interface DeviceGroup {
  device: string;
  benchmarks: Benchmark[];
}

/**
 * Speeds only compare on the same hardware, so the benchmarks sit under the
 * device they ran on, each device's fastest first, and the device that reached
 * the highest speed first. A benchmark with no speed goes last in its group.
 */
const groupByDevice = (benchmarks: Benchmark[]): DeviceGroup[] => {
  const groups = new Map<string, Benchmark[]>();
  for (const benchmark of benchmarks) {
    const device = deviceOf(benchmark);
    groups.set(device, [...(groups.get(device) ?? []), benchmark]);
  }
  const speed = (benchmark: Benchmark) => fpsOf(benchmark) ?? -Infinity;
  return [...groups.entries()]
    .map(([device, items]) => ({ device, benchmarks: [...items].sort((a, b) => speed(b) - speed(a)) }))
    .sort((a, b) => speed(b.benchmarks[0]) - speed(a.benchmarks[0]) || a.device.localeCompare(b.device));
};

const ProjectBenchmarksTab: React.FC<ProjectBenchmarksTabProps> = ({ benchmarksResponse, isLoading, isOwner }) => {
  const compact = useCompactLayout();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [benchmarkToDelete, setBenchmarkToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteBenchmark = (id: string) => {
    setBenchmarkToDelete(id);
    setDeleteDialogOpen(true);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!benchmarkToDelete) return;

    try {
      setIsDeleting(true);
      await benchmarkService.deleteBenchmark(benchmarkToDelete);
      // The list and the count on the tab and the overview, without reloading the page under whoever is reading.
      queryClient.invalidateQueries({ queryKey: ['project-benchmarks'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard-stats'] });
      setDeleteDialogOpen(false);
      setBenchmarkToDelete(null);
    } catch (err) {
      setDeleteError('Failed to delete benchmark');
      console.error('Error deleting benchmark:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setBenchmarkToDelete(null);
    setDeleteError(null);
  };
  const benchmarks = useMemo(() => benchmarksResponse?.data?.benchmarks ?? [], [benchmarksResponse]);
  const total = benchmarksResponse?.data?.pagination?.total ?? benchmarks.length;
  const groups = useMemo(() => groupByDevice(benchmarks), [benchmarks]);

  const trainingOf = (benchmark: Benchmark) =>
    benchmark.training_id && typeof benchmark.training_id === 'object' ? benchmark.training_id : null;

  return (
    <Box sx={{ px: { xs: 0, sm: 3 } }}>
      <Typography variant="h6" gutterBottom>
        Benchmarks
      </Typography>
      {isLoading ? (
        <ListSkeleton rows={5} label="Loading benchmarks" />
      ) : benchmarks.length > 0 ? (
        <>
          {groups.map((group) => (
            <Box key={group.device} component="section" aria-label={group.device} sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {group.device}
                <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
                  {group.benchmarks.length} benchmark{group.benchmarks.length === 1 ? '' : 's'}
                </Typography>
              </Typography>
              {compact ? (
                <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                  {group.benchmarks.map((benchmark) => {
                    const firstResult = benchmark.results && benchmark.results.length > 0 ? benchmark.results[0] : null;
                    const trainingObj = trainingOf(benchmark);
                    const trainingName = trainingObj?.name || 'Unknown';
                    return (
                      <MobileListRow
                        key={benchmark._id}
                        to={trainingObj?._id ? `/trainings/${trainingObj._id}?tab=benchmarks` : undefined}
                        title={trainingName}
                        figures={[
                          { label: 'FPS', value: formatFps(firstResult) },
                          { label: 'Parameters', value: formatParameters(firstResult) }
                        ]}
                        footer={formatDateTime(benchmark.timestamp)}
                        actionsLabel={`Actions for ${trainingName} benchmark`}
                        actions={
                          isOwner
                            ? [
                                {
                                  label: 'Delete',
                                  icon: <DeleteIcon fontSize="small" />,
                                  onClick: () => handleDeleteBenchmark(benchmark._id),
                                  danger: true
                                }
                              ]
                            : []
                        }
                      />
                    );
                  })}
                </Paper>
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Training</TableCell>
                        <TableCell align="right">FPS</TableCell>
                        <TableCell align="right">Parameters</TableCell>
                        <TableCell>Timestamp</TableCell>
                        {isOwner && <TableCell>Actions</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.benchmarks.map((benchmark) => {
                        const firstResult =
                          benchmark.results && benchmark.results.length > 0 ? benchmark.results[0] : null;
                        const trainingObj = trainingOf(benchmark);
                        const trainingId = trainingObj?._id || null;
                        const trainingName = trainingObj?.name || 'Unknown';

                        return (
                          <TableRow key={benchmark._id}>
                            <TableCell>
                              {trainingId ? (
                                <Link
                                  to={`/trainings/${trainingId}?tab=benchmarks`}
                                  style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                  <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                                    {trainingName}
                                  </Typography>
                                </Link>
                              ) : (
                                <Typography variant="body2">{trainingName}</Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatFps(firstResult)}
                            </TableCell>
                            <TableCell align="right">{formatParameters(firstResult)}</TableCell>
                            <TableCell>{formatDateTime(benchmark.timestamp)}</TableCell>
                            {isOwner && (
                              <TableCell>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteBenchmark(benchmark._id);
                                    }}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          ))}
          {total > benchmarks.length && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Showing the newest {benchmarks.length.toLocaleString()} of {total.toLocaleString()} benchmarks.
            </Typography>
          )}
        </>
      ) : (
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary'
          }}
        >
          No benchmarks yet. They are speed and memory measurements that a run reports from its benchmark stage.
        </Typography>
      )}
      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Benchmark"
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={isDeleting}
        error={deleteError}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      >
        Are you sure you want to delete this benchmark? This action cannot be undone.
      </ConfirmDialog>
    </Box>
  );
};

export default ProjectBenchmarksTab;
