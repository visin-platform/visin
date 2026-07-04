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
        const isMinioPath = analysis.downloadUrl.startsWith('minio:') || analysis.downloadUrl.startsWith('datasets/');
        if (isMinioPath) {
          const minioPath = analysis.downloadUrl.startsWith('minio:')
            ? analysis.downloadUrl.substring(6)
            : analysis.downloadUrl;
          try {
            const signedUrlData = await datasetService.getSignedUrl(minioPath);
            triggerDownload(signedUrlData.signedUrl, filename);
          } catch {
            onError('Failed to generate download URL for MinIO path');
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
