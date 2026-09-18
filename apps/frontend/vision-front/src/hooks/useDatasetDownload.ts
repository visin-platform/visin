import { useState } from 'react';
import { getDownloadUrl } from '../services/datasetService';

const triggerDownload = (url: string, filename: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** Download a dataset's whole zip through a short-lived signed URL. */
export function useDatasetDownload(onError: (message: string) => void) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (datasetId: string) => {
    try {
      setDownloadingId(datasetId);
      const { downloadUrl, filename } = await getDownloadUrl(datasetId);
      triggerDownload(downloadUrl, filename);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to download dataset');
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, download };
}
