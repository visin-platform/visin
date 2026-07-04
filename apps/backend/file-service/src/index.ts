import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { securityHeaders, requestLogger, errorHandler, logger } from '@visin/backend-core';
import routes from './routes/routes';

// Validate required env vars at startup
const REQUIRED_ENV = ['FILE_SERVICE_API_KEY', 'FILE_SERVICE_HMAC_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`Fatal: missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5002;

// Every service runs behind the nginx reverse proxy — trust its X-Forwarded-*
// headers so express-rate-limit and req.ip key on the real client, not the proxy.
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(requestLogger);

// Rate limiting
const generalLimiter = rateLimit({ windowMs: 60_000, limit: 500, standardHeaders: true, legacyHeaders: false });
app.use(generalLimiter);

// Middleware
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
}));

// No blanket express.json() here: upload routes stream raw binary bodies
// directly in their controllers, so JSON parsing is applied per-route (in
// routes.ts) only on the handful of endpoints that actually expect a JSON
// body — a global path-guessing middleware previously skipped JSON parsing
// for any PUT under '/internal/files/', which also unintentionally matched
// PUT /internal/files/folder and silently dropped its request body.

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'file-service', timestamp: new Date().toISOString() });
});

// All file routes
app.use('/', routes);

// Must be mounted last, after all routes
app.use(errorHandler);

app.listen(PORT, () => logger.info(`File service started on port ${PORT}`));

export default app;
