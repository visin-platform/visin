import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { securityHeaders, requestLogger, errorHandler, logger } from '@visin/backend-core';
import connectDB from './config/database';
import datasetRoutes from './routes/datasetRoutes';
import trainingRoutes from './routes/trainingRoutes';
import epochRoutes from './routes/epochRoutes';
import configRoutes from './routes/configRoutes';
import analysisRoutes from './routes/analysisRoutes';
import datasetImageRoutes from './routes/datasetImageRoutes';
import testResultRoutes from './routes/testResultRoutes';
import visualizationRoutes from './routes/visualizationRoutes';
import benchmarkRoutes from './routes/benchmarkRoutes';
import comparisonRoutes from './routes/comparisonRoutes';
import projectRoutes from './routes/projectRoutes';
import apiTokenRoutes from './routes/apiTokenRoutes';
import imageCategoryRoutes from './routes/imageCategoryRoutes';
import { healthCheck } from './controllers/healthController';
import { apiTokenMiddleware } from './middleware/apiTokenMiddleware';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 4010;

// Middleware
app.use(securityHeaders);
app.use(requestLogger);

// Rate limiting
app.use(rateLimit({ windowMs: 60_000, limit: 500, standardHeaders: true, legacyHeaders: false }));

const allowedOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id']
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for large training data

// Global Middleware
app.use(apiTokenMiddleware);

// Routes
app.use('/api/datasets', datasetRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/epochs', epochRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/dataset-images', datasetImageRoutes);
app.use('/api/test-results', testResultRoutes);
app.use('/api/visualizations', visualizationRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/comparisons', comparisonRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/api-tokens', apiTokenRoutes);
app.use('/api/image-categories', imageCategoryRoutes);

// Serve OpenAPI docs as static files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// Health check endpoint
app.get('/health', healthCheck);

// Must be mounted last, after all routes
app.use(errorHandler);

// Start the server
app.listen(PORT, () => logger.info(`Vision service started successfully on port ${PORT}`));

export default app;
