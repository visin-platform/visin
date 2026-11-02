import type { EventEmitter } from 'events';
import { context, trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import { databaseQueriesTotal, databaseQueryDuration } from '../metrics';
import { getTracer } from '../tracing';

/**
 * Times every query the MongoDB driver sends, whoever sent it.
 *
 * It listens to the driver's own command events (`monitorCommands`, switched on in
 * connectDb) instead of wrapping Mongoose, so it needs no plugin registered before
 * the models are compiled. Each query becomes one observation in
 * `database_query_duration_seconds`, and, inside a traced request, one child span.
 *
 * Only the operation and the collection are recorded. The filter and the
 * documents are not: they hold what people wrote.
 */

/** Data commands. The handshake, pings and cursor housekeeping are left out. */
const OPERATIONS = new Set([
  'find',
  'aggregate',
  'insert',
  'update',
  'delete',
  'findAndModify',
  'count',
  'distinct',
  'getMore'
]);

interface CommandStarted {
  requestId: number;
  commandName: string;
  command: Record<string, unknown>;
}

interface CommandFinished {
  requestId: number;
  /** Milliseconds, measured by the driver. */
  duration: number;
}

interface InFlight {
  operation: string;
  collection: string;
  span?: Span;
}

const observed = new WeakSet<EventEmitter>();

/** The collection a command is about; `getMore` names it in `collection`. */
function collectionOf(commandName: string, command: Record<string, unknown>): string {
  const name = commandName === 'getMore' ? command.collection : command[commandName];
  // A database-level aggregate has `aggregate: 1`.
  return typeof name === 'string' ? name : 'none';
}

/** Idempotent: a client that is already observed is left alone. */
export function observeCommands(client: EventEmitter): void {
  if (observed.has(client)) return;
  observed.add(client);

  const inFlight = new Map<number, InFlight>();

  client.on('commandStarted', (event: CommandStarted) => {
    if (!OPERATIONS.has(event.commandName)) return;
    const operation = event.commandName;
    const collection = collectionOf(operation, event.command);

    // Only inside a request that is being traced: a query with no request around
    // it would be a trace of one span.
    const parent = context.active();
    const span = trace.getSpan(parent)
      ? getTracer().startSpan(
          `mongodb.${operation} ${collection}`,
          {
            kind: SpanKind.CLIENT,
            attributes: { 'db.system': 'mongodb', 'db.operation.name': operation, 'db.collection.name': collection }
          },
          parent
        )
      : undefined;

    inFlight.set(event.requestId, { operation, collection, span });
  });

  const finish = (event: CommandFinished, status: 'success' | 'error') => {
    const started = inFlight.get(event.requestId);
    if (!started) return;
    inFlight.delete(event.requestId);

    databaseQueryDuration.labels(started.operation, started.collection).observe(event.duration / 1000);
    databaseQueriesTotal.labels(started.operation, started.collection, status).inc();

    if (started.span) {
      if (status === 'error') started.span.setStatus({ code: SpanStatusCode.ERROR });
      started.span.end();
    }
  };

  client.on('commandSucceeded', (event: CommandFinished) => finish(event, 'success'));
  client.on('commandFailed', (event: CommandFinished) => finish(event, 'error'));
}
