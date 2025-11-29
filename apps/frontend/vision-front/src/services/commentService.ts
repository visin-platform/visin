import { visionApi } from '../config/visionApi';
import {
  Comment,
  CreateCommentData,
  UpdateCommentData,
  ApiResponse,
  PaginatedResponse
} from '../types';

export const commentService = {
  // Get all comments for a training (optionally filtered by section)
  async getCommentsByTraining(trainingId: string, section?: string, params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Comment>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (section) queryParams.append('section', section);

    const response = await visionApi.get(`/comments/training/${trainingId}?${queryParams}`);
    return response.data;
  },

  // Get comment by ID
  async getCommentById(id: string): Promise<ApiResponse<Comment>> {
    const response = await visionApi.get(`/comments/${id}`);
    return response.data;
  },

  // Create a new comment
  async createComment(commentData: CreateCommentData): Promise<ApiResponse<Comment>> {
    const response = await visionApi.post('/comments', commentData);
    return response.data;
  },

  // Update a comment
  async updateComment(id: string, commentData: UpdateCommentData): Promise<ApiResponse<Comment>> {
    const response = await visionApi.put(`/comments/${id}`, commentData);
    return response.data;
  },

  // Delete a comment
  async deleteComment(id: string): Promise<ApiResponse<void>> {
    const response = await visionApi.delete(`/comments/${id}`);
    return response.data;
  }
};