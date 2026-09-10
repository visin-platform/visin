import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip,
  IconButton,
  Box,
  CircularProgress
} from '@mui/material';
import { Visibility as VisibilityIcon } from '@mui/icons-material';
import { Config } from '../../types';

/**
 * Read-only. A config is the record of what a training run was configured
 * with, written by the pipeline that reported it — editing or deleting one
 * would rewrite history for every training citing it, and a training's config
 * is set by that pipeline rather than chosen here.
 */
interface ConfigsTableProps {
  configs: Config[];
  loading: boolean;
  onViewDetails: (config: Config) => void;
}

const ConfigsTable: React.FC<ConfigsTableProps> = ({ configs, loading, onViewDetails }) => {
  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Config Name</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
            <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {configs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} sx={{ textAlign: 'center', py: 3 }}>
                No configs uploaded yet
              </TableCell>
            </TableRow>
          ) : (
            configs.map((config) => (
              <TableRow key={config._id} hover>
                <TableCell>{config.config_name || 'Unnamed'}</TableCell>
                <TableCell>
                  <Chip label={config.summary} variant="outlined" size="small" />
                </TableCell>
                <TableCell>{formatDate(config.createdAt)}</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  <Tooltip title="View config details">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(config);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ConfigsTable;
