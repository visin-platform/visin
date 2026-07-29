import { useState } from 'react';
import { datasetService, Dataset } from '../services/datasetService';
import { DatasetAnalysis } from '../services/analysisService';

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function useDatasetDownload(onError: (message: string) => void) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (analysis: DatasetAnalysis) => {
    try {
      setDownloadingId(analysis._id);
      const filename = `${analysis.dataset}.zip`;

      if (analysis.downloadUrl) {
        // A `datasets/` value is a file-service storage path, not a URL, so it
        // has to be exchanged for a signed URL first.
        if (analysis.downloadUrl.startsWith('datasets/')) {
          try {
            const signedUrlData = await datasetService.getSignedUrl(analysis.downloadUrl);
            triggerDownload(signedUrlData.signedUrl, filename);
          } catch {
            onError('Failed to generate download URL for storage path');
          }
          return;
        }

        triggerDownload(analysis.downloadUrl, filename);
        return;
      }

      // Otherwise, fall back to dataset lookup
      const datasets = await datasetService.getDatasets({ search: analysis.dataset, limit: 1 });
      const dataset = datasets.data.datasets.find((d: Dataset) => d.name === analysis.dataset);

      if (!dataset?.uuid) {
        onError('Dataset not found or missing UUID');
        return;
      }

      const downloadData = await datasetService.downloadDataset(dataset.uuid);
      if (downloadData.downloadUrl) {
        triggerDownload(downloadData.downloadUrl, filename);
      } else {
        onError('No download URL available');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to download dataset');
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, download };
}
