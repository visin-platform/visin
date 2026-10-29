import React, { useState } from 'react';
import { Alert, Box, Button, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Code as CodeIcon, TableView as TableIcon } from '@mui/icons-material';
import { comparisonService } from '../../services/comparisonService';
import type { Comparison } from '../../types';

// Helper function to format dates as DD.MM.YYYY
const formatDate = (date: string | Date) => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

interface ComparisonHeaderProps {
  comparison: Comparison;
  canEdit: boolean;
  /** Whether any run was compared, which the LaTeX export needs. */
  hasData: boolean;
  onExportLatex: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** The comparison's name, description and dates, with its export, edit and delete actions. */
const ComparisonHeader: React.FC<ComparisonHeaderProps> = ({ comparison, canEdit, hasData, onExportLatex, onEdit, onDelete }) => {
  const [exportMenu, setExportMenu] = useState<HTMLElement | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  return (
    <>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {comparison.name}
            </Typography>

            {comparison.description && (
              <Typography
                variant="body1"
                sx={{
                  color: "text.secondary",
                  mb: 2
                }}>
                {comparison.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title="Export All LaTeX">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CodeIcon />}
                  onClick={onExportLatex}
                  disabled={!hasData}
                >
                  Export LaTeX
                </Button>
              </span>
            </Tooltip>
            {comparison.type === 'trainings' && (
              <>
                <Tooltip title="Export table">
                  <Button variant="outlined" size="small" startIcon={<TableIcon />} onClick={(event) => setExportMenu(event.currentTarget)}>
                    Export table
                  </Button>
                </Tooltip>
                <Menu anchorEl={exportMenu} open={Boolean(exportMenu)} onClose={() => setExportMenu(null)}>
                  {(['xlsx', 'csv'] as const).map((format) => (
                    <MenuItem
                      key={format}
                      onClick={async () => {
                        setExportMenu(null);
                        setExportError(null);
                        try {
                          await comparisonService.exportTable(comparison._id, format);
                        } catch (err) {
                          setExportError(err instanceof Error ? err.message : 'Export failed');
                        }
                      }}
                    >
                      {format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
            {canEdit && (
              <>
              <Tooltip title="Edit Comparison">
                <IconButton
                  onClick={onEdit}
                  color="primary"
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete Comparison">
                <IconButton
                  onClick={onDelete}
                  color="error"
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
              </>
            )}
          </Box>
        </Box>

        {exportError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError(null)}>{exportError}</Alert>}
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Created: {formatDate(comparison.createdAt)}
          {comparison.updatedAt !== comparison.createdAt && (
            <> • Updated: {formatDate(comparison.updatedAt)}</>
          )}
        </Typography>
      </Box>
    </>
  );
};

export default ComparisonHeader;
