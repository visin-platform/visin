import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { trainingService } from '../services/trainingService';

// Get all trainings
export const getTrainings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { 
      page, 
      limit, 
      search, 
      status, 
      datasetId,
      projectId,
      tags
    } = req.query;

    const filters = {
      search: search as string,
      status: status as string,
      datasetId: datasetId as string,
      projectId: projectId as string,
      tags: tags as string | string[]
    };

    const pagination = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    };

    const result = await trainingService.getTrainings(userId, filters, pagination);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching trainings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch trainings';
    
    if (errorMessage === 'Project not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied to project') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch trainings',
        error: errorMessage
      });
    }
  }
};

// Get training by ID
export const getTrainingById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = req.user?.id;

    const training = await trainingService.getTrainingById(id, userId);

    res.json({
      success: true,
      data: training
    });
  } catch (error) {
    console.error('Error fetching training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training';
    
    if (errorMessage === 'Training not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch training',
        error: errorMessage
      });
    }
  }
};

// Get training by UUID
export const getTrainingByUuid = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uuid = req.params.uuid as string;
    const userId = req.user?.id;

    const training = await trainingService.getTrainingByUuid(uuid, userId);

    res.json({
      success: true,
      data: training
    });
  } catch (error) {
    console.error('Error fetching training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training';
    
    if (errorMessage === 'Training not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch training',
        error: errorMessage
      });
    }
  }
};

// Get training with epochs
export const getTrainingWithEpochs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { sortBy, order } = req.query;

    const sortByStr = typeof sortBy === 'string' ? sortBy : 'epoch';
    const orderStr = (typeof order === 'string' && (order === 'asc' || order === 'desc')) ? order as 'asc' | 'desc' : 'asc';

    const result = await trainingService.getTrainingWithEpochs(
      id as string, 
      userId, 
      sortByStr, 
      orderStr
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching training with epochs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training with epochs';
    
    if (errorMessage === 'Training not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch training with epochs',
        error: errorMessage
      });
    }
  }
};

// Create training
export const createTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    // Determine effective projectId: API tokens take precedence, otherwise use request body
    const effectiveProjectId = (req as any).projectId || req.body.projectId;

    const trainingData = {
      ...req.body,
      projectId: effectiveProjectId
    };

    const savedTraining = await trainingService.createTraining(userId, trainingData);

    res.status(201).json({
      success: true,
      message: 'Training created successfully',
      data: savedTraining
    });
  } catch (error) {
    console.error('Error creating training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create training';
    
    if (errorMessage === 'Training name is required') {
      res.status(400).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied to project') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create training',
        error: errorMessage
      });
    }
  }
};

// Update training
export const updateTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const { id } = req.params;
    const updatedTraining = await trainingService.updateTraining(id as string, userId, req.body);

    res.json({
      success: true,
      message: 'Training updated successfully',
      data: updatedTraining
    });
  } catch (error) {
    console.error('Error updating training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update training';
    
    if (errorMessage === 'Invalid training ID format') {
      res.status(400).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Training not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update training',
        error: errorMessage
      });
    }
  }
};

// Delete training
export const deleteTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const { id } = req.params;
    await trainingService.deleteTraining(id as string, userId);

    res.json({
      success: true,
      message: 'Training and associated data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting training:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete training';
    
    if (errorMessage === 'Invalid training ID format') {
      res.status(400).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Training not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Access denied') {
      res.status(403).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to delete training',
        error: errorMessage
      });
    }
  }
};

// Get training statistics
export const getTrainingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, datasetId, tags, projectId } = req.query;

    const filters = {
      status: status as string,
      datasetId: datasetId as string,
      projectId: projectId as string,
      tags: tags as string | string[]
    };

    const result = await trainingService.getTrainingStats(filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching training stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch training stats';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training stats',
      error: errorMessage
    });
  }
};

// Compare trainings
export const compareTrainings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { trainingIds } = req.body;

    if (!trainingIds || !Array.isArray(trainingIds) || trainingIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Training IDs array is required'
      });
      return;
    }

    const result = await trainingService.compareTrainings(trainingIds);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error comparing trainings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to compare trainings';
    
    if (errorMessage === 'Maximum 30 trainings can be compared at once') {
      res.status(400).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to compare trainings',
        error: errorMessage
      });
    }
  }
};
