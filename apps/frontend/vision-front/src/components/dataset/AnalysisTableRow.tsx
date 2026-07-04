import React from 'react';
import { Box, Checkbox, CircularProgress, IconButton, TableCell, TableRow, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Download as DownloadIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { DatasetAnalysis } from '../../services/analysisService';
import { formatDateTime } from '../../utils';

interface AnalysisTableRowProps {
  analysis: DatasetAnalysis;
  isSelected: boolean;
  onSelect: (analysisId: string) => void;
  canEdit: boolean;
  canDelete: boolean;
  isDownloading: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  onDownload: (analysis: DatasetAnalysis) => void;
  onEdit: (analysis: DatasetAnalysis) => void;
  onDelete: (analysis: DatasetAnalysis) => void;
}

const AnalysisTableRow: React.FC<AnalysisTableRowProps> = ({
  analysis,
  isSelected,
  onSelect,
  canEdit,
  canDelete,
  isDownloading,
  isDeleting,
  isEditing,
  onDownload,
  onEdit,
  onDelete
}) => {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <TableRow
      hover
      selected={isSelected}
      onClick={() => navigate(`/datasets/${analysis._id}`)}
      sx={{
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        '&.Mui-selected': {
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
          }
        }
      }}
    >
      <TableCell padding="checkbox">
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(analysis._id);
          }}
        />
      </TableCell>
      <TableCell>{analysis.dataset}</TableCell>
      <TableCell>{analysis.size || '-'}</TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {formatDateTime(analysis.createdAt)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {formatDateTime(analysis.updatedAt)}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
          {analysis.downloadUrl && (
            <Tooltip title="Download dataset">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(analysis);
                }}
                disabled={isDownloading}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'success.main', bgcolor: alpha(theme.palette.success.main, 0.1) }
                }}
              >
                {isDownloading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {canEdit && (
            <Tooltip title="Edit dataset name">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit(analysis);
                }}
                disabled={isEditing}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.1) }
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="Delete analysis">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(analysis);
                }}
                disabled={isDeleting}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
};

export default AnalysisTableRow;
