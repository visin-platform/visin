import { visionApi } from '../config/visionApi';
import {
  TestResult,
  CreateTestResultData,
  ApiResponse,
  PaginatedResponse
} from '../types';

// Test result comparison types
export interface TestResultComparison {
  testResult: {
    _id: string;
    test_uuid: string;
    epoch: number;
    epoch_uuid: string;
    timestamp: string;
    createdAt: string;
    updatedAt: string;
  };
  training: {
    _id: string;
    name: string;
    uuid: string;
    status: string;
  } | null;
  epoch: {
    epoch: number;
    epoch_time?: number;
    results: any;
  } | null;
  test_results: any;
}

export interface TestResultComparisonResponse {
  comparison: TestResultComparison[];
  summary: {
    totalTestResults: number;
    conditions: string[];
    classes: string[];
  };
}

export const testResultService = {
  // Get all test results
  async getTestResults(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
    epoch?: number;
    epoch_uuids?: string;
    training_uuid?: string;
  }): Promise<PaginatedResponse<TestResult>> {
    const response = await visionApi.get('/test-results', { params });
    return response.data;
  },

  // Get test result by ID
  async getTestResultById(id: string): Promise<ApiResponse<TestResult>> {
    const response = await visionApi.get(`/test-results/${id}`);
    return response.data;
  },

  // Get test result by test UUID
  async getTestResultByTestUuid(testUuid: string): Promise<ApiResponse<TestResult>> {
    const response = await visionApi.get(`/test-results/test/${testUuid}`);
    return response.data;
  },

  // Get test results by epoch UUID
  async getTestResultsByEpochUuid(epochUuid: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<TestResult>> {
    const response = await visionApi.get(`/test-results/epoch/${epochUuid}`, { params });
    return response.data;
  },

  // Create test result
  async createTestResult(testResultData: CreateTestResultData): Promise<ApiResponse<TestResult>> {
    const response = await visionApi.post('/test-results', testResultData);
    return response.data;
  },

  // Upload test result from JSON file
  async uploadTestResult(testResultData: any): Promise<ApiResponse<TestResult>> {
    const response = await visionApi.post('/test-results/upload', testResultData);
    return response.data;
  },

  // Update test result
  async updateTestResult(id: string, testResultData: Partial<CreateTestResultData>): Promise<ApiResponse<TestResult>> {
    const response = await visionApi.put(`/test-results/${id}`, testResultData);
    return response.data;
  },

  // Delete test result
  async deleteTestResult(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/test-results/${id}`);
    return response.data;
  },

  // Get unique epochs that have test results
  async getTestResultEpochs(): Promise<ApiResponse<{ epochs: number[] }>> {
    const response = await visionApi.get('/test-results/epochs');
    return response.data;
  },

  // Compare multiple test results
  async compareTestResults(testResultIds: string[]): Promise<ApiResponse<TestResultComparisonResponse>> {
    const response = await visionApi.post('/test-results/compare', { testResultIds });
    return response.data;
  }
};