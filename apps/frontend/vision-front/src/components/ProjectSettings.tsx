import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiTokenService, ApiToken } from '../services/apiTokenService';
import { Project } from '../types/Project';

interface ProjectSettingsProps {
  project: Project;
}

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project }) => {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [createdToken, setCreatedToken] = useState<ApiToken | null>(null);

  const { data: tokensResponse } = useQuery({
    queryKey: ['api-tokens', project._id],
    queryFn: () => apiTokenService.getTokens(project._id)
  });

  const createMutation = useMutation({
    mutationFn: apiTokenService.createToken,
    onSuccess: (response) => {
      setCreatedToken(response.data);
      queryClient.invalidateQueries({ queryKey: ['api-tokens', project._id] });
      setNewTokenName('');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: apiTokenService.revokeToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens', project._id] });
    }
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: newTokenName,
      projectId: project._id,
      expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined
    });
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setCreatedToken(null);
    setNewTokenName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">API Tokens</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Generate New Token
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        API tokens allow you to authenticate requests to the Vision API programmatically. 
        Use these tokens to submit trainings or track usage from your scripts.
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Prefix</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokensResponse?.data?.map((token: ApiToken) => (
              <TableRow key={token._id}>
                <TableCell>{token.name}</TableCell>
                <TableCell>
                  <Chip label={token.prefix + '...'} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                </TableCell>
                <TableCell>{new Date(token.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'Never'}
                </TableCell>
                <TableCell>
                  {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : 'Never'}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={token.isActive ? 'Active' : 'Revoked'} 
                    color={token.isActive ? 'success' : 'default'} 
                    size="small" 
                  />
                </TableCell>
                <TableCell align="right">
                  {token.isActive && (
                    <Tooltip title="Revoke Token">
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to revoke this token?')) {
                            revokeMutation.mutate(token._id);
                          }
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!tokensResponse?.data || tokensResponse.data.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">No API tokens found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Generate API Token</DialogTitle>
        <DialogContent>
          {!createdToken ? (
            <Box sx={{ pt: 1 }}>
              <TextField
                autoFocus
                margin="dense"
                label="Token Name"
                fullWidth
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g. CI/CD Pipeline, Local Training Script"
              />
              <TextField
                margin="dense"
                label="Expiration (Days)"
                type="number"
                fullWidth
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                helperText="Leave empty for no expiration"
              />
            </Box>
          ) : (
            <Box sx={{ pt: 2 }}>
              <Alert severity="success" sx={{ mb: 2 }}>
                Token generated successfully! Copy it now, you won't be able to see it again.
              </Alert>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  bgcolor: 'grey.50', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {createdToken.token}
                </Typography>
                <IconButton onClick={() => copyToClipboard(createdToken.token || '')}>
                  <CopyIcon />
                </IconButton>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!createdToken ? (
            <>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button 
                onClick={handleCreate} 
                variant="contained"
                disabled={!newTokenName || createMutation.isPending}
              >
                Generate
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseDialog} variant="contained">
              Done
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectSettings;
