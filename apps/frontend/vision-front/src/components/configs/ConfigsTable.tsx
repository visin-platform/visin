import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Chip,
  Tooltip,
  IconButton,
  Box,
  Typography,
  Button,
  CircularProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  DeleteOutlined as DeleteOutlineIcon
} from '@mui/icons-material';
import { Config } from '../../types';

interface ConfigsTableProps {
  configs: Config[];
  loading: boolean;
  selectedConfigIds: Set<string>;
  onSelectAll: () => void;
  onSelectConfig: (configId: string) => void;
  onViewDetails: (config: Config) => void;
  onEdit: (config: Config) => void;
  onDelete: (configId: string) => void;
  onDeleteMultiple: () => void;
}

const ConfigsTable: React.FC<ConfigsTableProps> = ({
  configs,
  loading,
  selectedConfigIds,
  onSelectAll,
  onSelectConfig,
  onViewDetails,
  onEdit,
  onDelete,
  onDeleteMultiple
}) => {
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
    <>
      {selectedConfigIds.size > 0 && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {selectedConfigIds.size} config(s) selected
          </Typography>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteOutlineIcon />}
            onClick={onDeleteMultiple}
          >
            Delete Selected
          </Button>
        </Box>
      )}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ fontWeight: 'bold' }}>
                <Checkbox
                  indeterminate={
                    selectedConfigIds.size > 0 && selectedConfigIds.size < configs.length
                  }
                  checked={configs.length > 0 && selectedConfigIds.size === configs.length}
                  onChange={onSelectAll}
                  disabled={configs.length === 0}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Config Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3 }}>
                  No configs uploaded yet
                </TableCell>
              </TableRow>
            ) : (
              configs.map((config) => (
                <TableRow
                  key={config._id}
                  hover
                  selected={selectedConfigIds.has(config._id)}
                  sx={{
                    backgroundColor: selectedConfigIds.has(config._id)
                      ? 'rgba(25, 118, 210, 0.08)'
                      : 'inherit'
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedConfigIds.has(config._id)}
                      onChange={() => onSelectConfig(config._id)}
                    />
                  </TableCell>
                  <TableCell>{config.config_name || 'Unnamed'}</TableCell>
                  <TableCell>
                    <Chip label={config.summary} variant="outlined" size="small" />
                  </TableCell>
                  <TableCell>
                    {formatDate(config.createdAt)}
                  </TableCell>
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
                    <Tooltip title="Edit config name">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(config);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete config">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(config._id);
                        }}
                        disabled={loading}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default ConfigsTable;
