import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { securityHeaders, requestLogger, errorHandler, logger } from '@visin/backend-core';
import authRoutes from './routes/authRoutes';
import { connectDb } from './config/db';
import path from 'path';
import { healthCheck } from './controllers/healthController';

// Load environment variables
dotenv.config();

if (!process.env.JWT_SECRET) {
  logger.error('Fatal: JWT_SECRET environment variable must be set');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5001;

// Every service runs behind the nginx reverse proxy — trust its X-Forwarded-*
// headers so express-rate-limit and req.ip key on the real client, not the proxy.
app.set('trust proxy', 1);

// Middleware
app.use(securityHeaders);
app.use(requestLogger);
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

// Rate limiting
const generalLimiter = rateLimit({ windowMs: 60_000, limit: 500, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

app.use(generalLimiter);
app.use('/auth/validate', loginLimiter);

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

// Must be mounted last, after all routes
app.use(errorHandler);

// Connect DB then start server
connectDb()
  .then(() => {
    app.listen(PORT, () => logger.info('Auth service started successfully', { port: PORT }));
  })
  .catch((err) => {
    logger.error('Failed to start auth-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
