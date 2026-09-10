import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { configService } from '../services/configService';
import { Config } from '../types';

export const useConfigsPage = () => {
  // State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Dialog states
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<Config | null>(null);

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
            summary,
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
    detailsDialogOpen,
    setDetailsDialogOpen,
    selectedConfig,
    fileInputRef,
    handleFileChange,
    handleViewDetails,
    handleRefresh
  };
};
