import React from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination
} from '@mui/material';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../utils';

interface ProjectBenchmarksTabProps {
  benchmarksResponse: any;
  isLoading: boolean;
  page: number;
  rowsPerPage: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const ProjectBenchmarksTab: React.FC<ProjectBenchmarksTabProps> = ({
  benchmarksResponse,
  isLoading,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange
}) => {
  return (
    <Box sx={{ px: 3 }}>
      <Typography variant="h6" gutterBottom>Benchmarks</Typography>
      {isLoading ? (
        <CircularProgress />
      ) : benchmarksResponse?.data?.benchmarks && benchmarksResponse.data.benchmarks.length > 0 ? (
        <>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Training</TableCell>
                  <TableCell>FPS</TableCell>
                  <TableCell>Parameters</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {benchmarksResponse.data.benchmarks.map((benchmark: any) => {
                  const firstResult = benchmark.results && benchmark.results.length > 0 ? benchmark.results[0] : null;

                  const formatParameters = (res: any) => {
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

                  // Determine training link id (prefer object _id)
                  const trainingObj = benchmark.training_id && typeof benchmark.training_id === 'object' ? benchmark.training_id : null;
                  const trainingId = trainingObj?._id || null;
                  const trainingName = trainingObj?.name || benchmark.training_name || 'Unknown';

                  return (
                    <TableRow key={benchmark._id}>
                      <TableCell>
                        {trainingId ? (
                          <Link to={`/trainings/${trainingId}?tab=benchmarks`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <Typography variant="body2" color="primary" fontWeight={500}>
                              {trainingName}
                            </Typography>
                          </Link>
                        ) : (
                          <Typography variant="body2">{trainingName}</Typography>
                        )}
                      </TableCell>
                      <TableCell>{firstResult?.fps !== undefined && firstResult?.fps !== null ? firstResult.fps.toFixed(2) : '-'}</TableCell>
                      <TableCell>{formatParameters(firstResult)}</TableCell>
                      <TableCell>{formatDateTime(benchmark.timestamp)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <TablePagination
              component="div"
              count={benchmarksResponse?.data?.pagination?.total || 0}
              page={page}
              onPageChange={onPageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={onRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No benchmarks found for this project.
        </Typography>
      )}
    </Box>
  );
};

export default ProjectBenchmarksTab;
