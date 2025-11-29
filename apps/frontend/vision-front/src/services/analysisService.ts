import { getGlobalConfig } from '../config/ConfigProvider';

export interface AnalysisResponse {
  data: DatasetAnalysis[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
  };
}

export interface DatasetAnalysis {
  _id: string;
  dataset: string;
  data: any; // Dynamic JSON structure
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisComparisonResponse {
  success: boolean;
  data: {
    comparison: Array<{
      analysis: {
        _id: string;
        dataset: string;
        createdAt: string;
        updatedAt: string;
      };
      data: any; // Dynamic JSON data
    }>;
    summary: {
      totalAnalyses: number;
      datasets: string[];
    };
  };
}

/**
 * Upload analysis JSON data
 */
export const uploadAnalysis = async (analysisData: any): Promise<DatasetAnalysis> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(analysisData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload analysis');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Create new dataset analysis (without data initially)
 */
export const createAnalysis = async (datasetName: string): Promise<DatasetAnalysis> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ dataset: datasetName })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create analysis');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Get all analyses
 */
export const getAllAnalyses = async (
  limit: number = 50,
  skip: number = 0,
  dataset?: string
): Promise<AnalysisResponse> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (dataset) {
    params.append('dataset', dataset);
  }

  const response = await fetch(`${apiUrl}/api/analysis?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch analyses');
  }

  return response.json();
};

/**
 * Get analyses by dataset name
 */
export const getAnalysesByDataset = async (
  datasetName: string,
  limit: number = 50,
  skip: number = 0
): Promise<AnalysisResponse> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });

  const response = await fetch(`${apiUrl}/api/analysis/dataset/${datasetName}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch analyses');
  }

  return response.json();
};

/**
 * Get analysis by ID
 */
export const getAnalysisById = async (id: string): Promise<DatasetAnalysis> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch analysis');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Update analysis by ID
 */
export const updateAnalysis = async (id: string, analysisData: any): Promise<DatasetAnalysis> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(analysisData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update analysis');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Delete analysis by ID
 */
export const deleteAnalysis = async (id: string): Promise<void> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete analysis');
  }
};

/**
 * Compare multiple analyses
 */
export const compareAnalyses = async (analysisIds: string[]): Promise<AnalysisComparisonResponse> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;
  
  const response = await fetch(`${apiUrl}/api/analysis/compare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ analysisIds })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to compare analyses');
  }

  return response.json();
};
