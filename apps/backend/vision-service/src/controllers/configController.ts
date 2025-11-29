import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Config from '../models/Config';
import Training from '../models/Training';

// Get all configs
export const getAllConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy = 'createdAt', order = 'desc' } = req.query;

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortField = sortBy as string;

    let query = Config.find().sort({ [sortField]: sortOrder });

    // If pagination is provided
    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      query = query.skip(skip).limit(Number(limit));
      
      const [configs, total] = await Promise.all([
        query,
        Config.countDocuments()
      ]);

      res.json({
        success: true,
        data: {
          configs,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } else {
      // Return all configs without pagination
      const configs = await query;
      
      res.json({
        success: true,
        data: {
          configs,
          total: configs.length
        }
      });
    }
  } catch (error) {
    console.error('Error fetching configs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configs'
    });
  }
};

// Get configs for a training (configs associated with training through selection)
export const getConfigsByTraining = async (req: Request, res: Response): Promise<void> => {
  try {
    const { trainingId } = req.params;

    // Check if training exists
    const training = await Training.findById(trainingId);
    if (!training) {
      res.status(404).json({
        success: false,
        message: 'Training not found'
      });
      return;
    }

    // If training has a configId, return that config
    if ((training as any).configId) {
      const config = await Config.findById((training as any).configId);
      if (config) {
        res.json({
          success: true,
          data: {
            configs: [config],
            total: 1
          }
        });
        return;
      }
    }

    res.json({
      success: true,
      data: {
        configs: [],
        total: 0
      }
    });
  } catch (error) {
    console.error('Error fetching configs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configs'
    });
  }
};

// Get config by ID
export const getConfigById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const config = await Config.findById(id);

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'Config not found'
      });
      return;
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch config'
    });
  }
};

// Get config by UUID
export const getConfigByUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;

    const config = await Config.findOne({ config_uuid: uuid });

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'Config not found'
      });
      return;
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch config'
    });
  }
};

// Create config
export const createConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      summary,
      config_data,
      config_name,
      metadata
    } = req.body;

    if (!summary) {
      res.status(400).json({
        success: false,
        message: 'Summary is required'
      });
      return;
    }

    if (!config_data) {
      res.status(400).json({
        success: false,
        message: 'Config data is required'
      });
      return;
    }

    // Generate UUID
    const config_uuid = uuidv4();

    const configData = new Config({
      config_uuid,
      summary,
      config_data,
      config_name,
      metadata
    });

    const savedConfig = await configData.save();

    res.status(201).json({
      success: true,
      message: 'Config created successfully',
      data: savedConfig
    });
  } catch (error) {
    console.error('Error creating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create config'
    });
  }
};

// Update config
export const updateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      summary,
      config_data,
      config_name,
      metadata
    } = req.body;

    const config = await Config.findById(id);

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'Config not found'
      });
      return;
    }

    // Update fields
    if (summary !== undefined) config.summary = summary;
    if (config_data !== undefined) config.config_data = config_data;
    if (config_name !== undefined) config.config_name = config_name;
    if (metadata !== undefined) config.metadata = metadata;

    const updatedConfig = await config.save();

    res.json({
      success: true,
      message: 'Config updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update config'
    });
  }
};

// Delete config
export const deleteConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const config = await Config.findById(id);

    if (!config) {
      res.status(404).json({
        success: false,
        message: 'Config not found'
      });
      return;
    }

    await Config.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Config deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete config'
    });
  }
};

// Create config from JSON file
export const createConfigFromJson = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      config_data,
      Summary,
      config_name,
      metadata
    } = req.body;

    if (!config_data) {
      res.status(400).json({
        success: false,
        message: 'Config data is required'
      });
      return;
    }

    const summary = Summary || req.body.summary || 'Config';
    const config_uuid = uuidv4();

    const configData = new Config({
      config_uuid,
      summary,
      config_data,
      config_name,
      metadata
    });

    const savedConfig = await configData.save();

    res.status(201).json({
      success: true,
      message: 'Config created successfully',
      data: savedConfig
    });
  } catch (error) {
    console.error('Error creating config from JSON:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create config'
    });
  }
};

// Batch create configs
export const createConfigsBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { configs } = req.body;

    if (!Array.isArray(configs) || configs.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Configs array is required and must not be empty'
      });
      return;
    }

    // Validate and prepare configs
    const preparedConfigs = configs.map((config: any) => {
      if (!config.summary || !config.config_data) {
        throw new Error('Each config must have summary and config_data');
      }

      return {
        ...config,
        config_uuid: config.config_uuid || uuidv4()
      };
    });

    const savedConfigs = await Config.insertMany(preparedConfigs);

    res.status(201).json({
      success: true,
      message: `${savedConfigs.length} configs created successfully`,
      data: savedConfigs
    });
  } catch (error) {
    console.error('Error creating configs batch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create configs batch'
    });
  }
};
