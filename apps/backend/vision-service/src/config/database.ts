import mongoose from 'mongoose';
import { logger } from '@visin/backend-core';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vision';

    await mongoose.connect(mongoURI);

    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error', { error: (error as Error).message });
    process.exit(1);
  }
};

export default connectDB;
