import { useState } from 'react';
import { getGlobalConfig } from '../config/ConfigProvider';

export function useDatasetImageExport(datasetId: string | undefined, onError: (message: string) => void) {
  const [exporting, setExporting] = useState<'good' | 'bad' | 'all' | null>(null);

  const handleExportImages = async (filter: 'good' | 'bad' | 'all') => {
    if (!datasetId) return;
    try {
      setExporting(filter);
      const config = getGlobalConfig();
      const apiUrl = config.VISION_API_URL || 'http://localhost:4010';
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('tag', filter);

      const response = await fetch(`${apiUrl}/api/dataset-images/export-names/${datasetId}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to export images');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      onError('Failed to export images');
    } finally {
      setExporting(null);
    }
  };

  return { exporting, handleExportImages };
}
