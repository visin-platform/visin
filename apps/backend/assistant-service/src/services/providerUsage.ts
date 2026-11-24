import { ProviderUsage } from '../models/ProviderUsage';
import { priceSnapshot } from './usage';
import type { Turn } from './providers';
export async function meteredCall<T extends Turn>(
  input: { runId: string; userId: string; provider: string; model: string; kind?: 'user' | 'guest' },
  call: () => Promise<T>
): Promise<T> {
  const price = await priceSnapshot(input.provider, input.model);
  // Persist before external work. A crash leaves pending usage visible as uncertain,
  // never a zero-cost successful call, and the worker must not replay paid work.
  const row = await ProviderUsage.create({ ...input, price, state: 'pending' });
  try {
    const turn = await call();
    const read = turn.cacheReadTokens ?? 0;
    const write = turn.cacheWriteTokens ?? 0;
    // Adapter inputTokens includes cache reads/writes for both providers.
    const uncached = Math.max(0, turn.inputTokens - read - write);
    const cost =
      price &&
      (!read || price.cacheReadPerMillion !== undefined) &&
      (!write || price.cacheWritePerMillion !== undefined)
        ? (uncached * price.inputPerMillion +
            read * (price.cacheReadPerMillion ?? 0) +
            write * (price.cacheWritePerMillion ?? 0) +
            turn.outputTokens * price.outputPerMillion) /
          1000000
        : undefined;
    await ProviderUsage.updateOne(
      { _id: row.id, state: 'pending' },
      {
        $set: {
          state: 'completed',
          inputTokens: turn.inputTokens,
          outputTokens: turn.outputTokens,
          cacheReadTokens: read,
          cacheWriteTokens: write,
          ...(cost === undefined ? {} : { estimatedCost: cost }),
          finishedAt: new Date()
        }
      }
    );
    return turn;
  } catch (error) {
    await ProviderUsage.updateOne(
      { _id: row.id, state: 'pending' },
      { $set: { state: 'uncertain', finishedAt: new Date() } }
    );
    throw error;
  }
}
