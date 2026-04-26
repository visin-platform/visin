import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/routes';

dotenv.config();

// Validate required env vars at startup
const REQUIRED_ENV = ['FILE_SERVICE_API_KEY', 'FILE_SERVICE_HMAC_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors());

// Raw body parser for file uploads – do NOT use express.json() before file routes.
// We handle raw streams manually in controllers, so only parse JSON where needed.
app.use((req, res, next) => {
  // Skip JSON parsing for upload routes – they stream raw binary
  if (req.path.includes('/files/upload/') || req.path.includes('/internal/files/')) {
    if (req.method === 'PUT') return next();
  }
  express.json()(req, res, next);
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'file-service', timestamp: new Date().toISOString() });
});

// All file routes
app.use('/', routes);

app.listen(PORT, () => console.log(`File service started on port ${PORT}`));

export default app;
