import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
const cookieParser = require('cookie-parser');
import authRoutes from './routes/authRoutes';
import { connectDb } from './config/db';
import path from 'path';
import { healthCheck } from './controllers/healthController';

// Load environment variables
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('Fatal: JWT_SECRET environment variable must be set');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS: ' + origin));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id'],
    exposedHeaders: ['Content-Type', 'Content-Length', 'ETag', 'Cache-Control']
  })
);

// Serve static documentation files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// Routes
app.use('/auth', authRoutes);

// Documentation root redirect
app.get('/docs', (req: Request, res: Response) => {
  res.redirect('/api/docs/index.html');
});

// Health check endpoint
app.get('/health', healthCheck);

// Connect DB then start server
connectDb()
  .then(() => {
    app.listen(PORT, () => console.log('Auth service started successfully', { port: PORT }));
  })
  .catch((err) => {
    console.error('Failed to start auth-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
