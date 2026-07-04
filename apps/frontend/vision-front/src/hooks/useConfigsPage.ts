import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configService } from '../services/configService';
import { Config } from '../types';

export const useConfigsPage = () => {
  // State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedConfigIds, setSelectedConfigIds] = useState<Set<string>>(new Set());
  const [deleteMultipleDialogOpen, setDeleteMultipleDialogOpen] = useState(false);

  // Dialog states
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<Config | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Config | null>(null);
  const [editConfigName, setEditConfigName] = useState('');

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    refetch: loadConfigs
  } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getAllConfigs()
  });

  const configs: Config[] = data?.data.configs || [];

  const invalidateConfigs = () => queryClient.invalidateQueries({ queryKey: ['configs'] });

  const editMutation = useMutation({
    mutationFn: (vars: { id: string; config_name: string }) =>
      configService.updateConfig(vars.id, { config_name: vars.config_name || undefined }),
    onSuccess: () => {
      setSuccess('Config name updated successfully!');
      setEditDialogOpen(false);
      setEditingConfig(null);
      setEditConfigName('');
      invalidateConfigs();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update config name');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (configId: string) => configService.deleteConfig(configId),
    onSuccess: () => {
      setSuccess('Config deleted successfully!');
      setDeleteDialogOpen(false);
      setDeleteConfigId(null);
      invalidateConfigs();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete config');
    }
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: async (configIds: string[]) => {
      for (const configId of configIds) {
        await configService.deleteConfig(configId);
      }
      return configIds.length;
    },
    onSuccess: (count) => {
      setSuccess(`${count} config(s) deleted successfully!`);
      setDeleteMultipleDialogOpen(false);
      setSelectedConfigIds(new Set());
      invalidateConfigs();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete configs');
    }
  });

  // Handle file selection and upload
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      setError('No files selected');
      return;
    }

    const fileArray = Array.from(files);
    const errors: string[] = [];
    let successCount = 0;

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      for (const file of fileArray) {
        try {
          const fileContent = await file.text();
          const configData = JSON.parse(fileContent);

          // Extract summary from config (usually the "Summary" field)
          const summary = configData.Summary || configData.summary || 'Config';
          const configName = file.name.replace('.json', '');

          // Upload config
          await configService.uploadConfig({
            config_data: configData,
            Summary: summary,
            config_name: configName
          });

          successCount++;
        } catch (fileErr) {
          errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : 'Upload failed'}`);
        }
      }

      if (successCount > 0) {
        setSuccess(`Upload finished - ${successCount} config(s) processed`);
        await invalidateConfigs();
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload configs');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle view details
  const handleViewDetails = (config: Config) => {
    setSelectedConfig(config);
    setDetailsDialogOpen(true);
  };

  // Handle edit click
  const handleEditClick = (config: Config) => {
    setEditingConfig(config);
    setEditConfigName(config.config_name || '');
    setEditDialogOpen(true);
  };

  // Handle edit save
  const handleEditSave = async () => {
    if (!editingConfig) return;
    editMutation.mutate({ id: editingConfig._id, config_name: editConfigName.trim() });
  };

  // Handle delete click
  const handleDeleteClick = (configId: string) => {
    setDeleteConfigId(configId);
    setDeleteDialogOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteConfigId) return;
    deleteMutation.mutate(deleteConfigId);
  };

  // Handle checkbox change
  const handleSelectConfig = (configId: string) => {
    const newSelected = new Set(selectedConfigIds);
    if (newSelected.has(configId)) {
      newSelected.delete(configId);
    } else {
      newSelected.add(configId);
    }
    setSelectedConfigIds(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedConfigIds.size === configs.length) {
      setSelectedConfigIds(new Set());
    } else {
      setSelectedConfigIds(new Set(configs.map(c => c._id)));
    }
  };

  // Handle delete selected
  const handleDeleteSelected = async () => {
    deleteSelectedMutation.mutate(Array.from(selectedConfigIds));
  };

  const handleRefresh = () => {
    loadConfigs();
  };

  return {
    configs,
    loading: loading || editMutation.isPending || deleteMutation.isPending || deleteSelectedMutation.isPending,
    error,
    setError,
    success,
    setSuccess,
    uploading,
    selectedConfigIds,
    deleteMultipleDialogOpen,
    setDeleteMultipleDialogOpen,
    detailsDialogOpen,
    setDetailsDialogOpen,
    selectedConfig,
    deleteDialogOpen,
    setDeleteDialogOpen,
    editDialogOpen,
    setEditDialogOpen,
    editingConfig,
    editConfigName,
    setEditConfigName,
    fileInputRef,
    handleFileChange,
    handleViewDetails,
    handleEditClick,
    handleEditSave,
    handleDeleteClick,
    handleConfirmDelete,
    handleSelectConfig,
    handleSelectAll,
    handleDeleteSelected,
    handleRefresh
  };
};
