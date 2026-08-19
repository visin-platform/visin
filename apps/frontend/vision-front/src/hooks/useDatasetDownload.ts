import { useState } from 'react';
import { DatasetAnalysis, getAnalysisDownloadUrl } from '../services/analysisService';

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
      // vision-service resolves the stored file to a signed URL — the browser
      // never has to know whether the record holds a path or an external link.
      const { downloadUrl } = await getAnalysisDownloadUrl(analysis._id);
      triggerDownload(downloadUrl, `${analysis.dataset}.zip`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to download dataset');
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, download };
}
