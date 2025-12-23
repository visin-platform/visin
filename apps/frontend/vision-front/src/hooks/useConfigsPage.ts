import { useState, useEffect, useRef } from 'react';
import { configService } from '../services/configService';
import { Config } from '../types';

export const useConfigsPage = () => {
  // State
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Load all configs on mount
  useEffect(() => {
    loadConfigs();
  }, []);

  // Load configs
  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await configService.getAllConfigs();
      setConfigs(response.data.configs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs');
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

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
        await loadConfigs();
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

    try {
      setLoading(true);
      setError(null);
      await configService.updateConfig(editingConfig._id, {
        config_name: editConfigName.trim() || undefined
      });
      setSuccess('Config name updated successfully!');
      setEditDialogOpen(false);
      setEditingConfig(null);
      setEditConfigName('');
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config name');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete click
  const handleDeleteClick = (configId: string) => {
    setDeleteConfigId(configId);
    setDeleteDialogOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteConfigId) return;

    try {
      setLoading(true);
      await configService.deleteConfig(deleteConfigId);
      setSuccess('Config deleted successfully!');
      setDeleteDialogOpen(false);
      setDeleteConfigId(null);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete config');
    } finally {
      setLoading(false);
    }
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
    try {
      setLoading(true);
      const configsToDelete = Array.from(selectedConfigIds);
      
      for (const configId of configsToDelete) {
        await configService.deleteConfig(configId);
      }
      
      setSuccess(`${configsToDelete.length} config(s) deleted successfully!`);
      setDeleteMultipleDialogOpen(false);
      setSelectedConfigIds(new Set());
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete configs');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadConfigs();
  };

  return {
    configs,
    loading,
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
