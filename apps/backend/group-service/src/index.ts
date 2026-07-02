import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { authenticateToken } from './middleware/authMiddleware';
import groupRoutes from './routes/groupRoutes';
import { healthCheck } from './controllers/healthController';

dotenv.config();

const app = express();
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id']
}));
app.use(express.json()); // Add body parser middleware

const MONGODB_URI = process.env.MONGODB_URI || '';
mongoose.connect(MONGODB_URI).then(() => console.log('MongoDB connected')).catch(err => console.error('MongoDB connection error', { error: err.message }));

// Health check endpoint
app.get('/health', healthCheck);

// Serve OpenAPI docs as static files (before auth middleware)
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

app.use('/api', authenticateToken);
app.use('/api/groups', groupRoutes);

const PORT = process.env.PORT || 5006;
app.listen(PORT, () => console.log('Group service started successfully', { port: PORT }));
