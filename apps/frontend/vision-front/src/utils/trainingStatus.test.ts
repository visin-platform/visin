import { describe, expect, it } from 'vitest';
import { trainingStatusLabel } from './trainingStatus';

describe('trainingStatusLabel', () => {
  it('shows elapsed silence without changing terminal status labels', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    expect(trainingStatusLabel({ status: 'stalled', lastSeenAt: '2026-10-02T10:00:00Z' }, now)).toBe('stalled — last heard 2 h ago');
    expect(trainingStatusLabel({ status: 'stalled', lastSeenAt: '2026-10-02T11:50:00Z' }, now)).toBe('stalled — last heard 10 min ago');
    expect(trainingStatusLabel({ status: 'stalled' }, now)).toBe('stalled');
    expect(trainingStatusLabel({ status: 'completed' }, now)).toBe('completed');
  });
});
