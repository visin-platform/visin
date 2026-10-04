import express, { type NextFunction, type Request, type Response } from 'express';

/**
 * Routes whose bodies carry large result payloads: training, epoch and benchmark ingestion, and
 * evaluations, whose schema allows two megabytes of results beside up to 64 KB of provenance. Everything else
 * (projects, comparisons, configs, ...) gets the smaller default. The schemas bound each payload themselves; this
 * only sets how much the parser will read before they run.
 */
export const LARGE_PAYLOAD_PREFIXES = ['/api/epochs', '/api/benchmarks', '/api/trainings', '/api/evaluations'];

export const bodyLimitFor = (path: string): '50mb' | '1mb' =>
  LARGE_PAYLOAD_PREFIXES.some(prefix => path.startsWith(prefix)) ? '50mb' : '1mb';

export const jsonBody = (req: Request, res: Response, next: NextFunction): void =>
  express.json({ limit: bodyLimitFor(req.path) })(req, res, next);
