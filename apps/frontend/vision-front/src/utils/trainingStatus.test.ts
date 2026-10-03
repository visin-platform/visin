import { describe, expect, it } from 'vitest';
import { describeEmpty, trainingStatusLabel } from './trainingStatus';

describe('trainingStatusLabel', () => {
  it('shows elapsed silence without changing terminal status labels', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    expect(trainingStatusLabel({ status: 'stalled', lastSeenAt: '2026-10-02T10:00:00Z' }, now)).toBe('stalled — last heard 2 h ago');
    expect(trainingStatusLabel({ status: 'stalled', lastSeenAt: '2026-10-02T11:50:00Z' }, now)).toBe('stalled — last heard 10 min ago');
    expect(trainingStatusLabel({ status: 'stalled' }, now)).toBe('stalled');
    expect(trainingStatusLabel({ status: 'completed' }, now)).toBe('completed');
  });
});

describe('describeEmpty', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');

  it('says a run that is still going has no test results yet, and why', () => {
    expect(describeEmpty('tests', { status: 'running' }, now)).toEqual({
      title: 'No test results yet',
      body: 'This run is still training. The test stage usually comes after it.'
    });
    expect(describeEmpty('tests', { status: 'pending' }, now).body).toMatch(/has not started/);
  });

  it('says what a finished run without them means: something did not happen', () => {
    expect(describeEmpty('tests', { status: 'completed' }, now)).toEqual({
      title: 'No test results',
      body: 'This run finished without reporting any. The test stage may have been skipped, or its results were never sent to Visin.'
    });
    expect(describeEmpty('benchmarks', { status: 'completed' }, now).body).toMatch(/The benchmark stage may have been skipped/);
  });

  it('blames a failed run, and a stalled one, instead of leaving the reader waiting', () => {
    expect(describeEmpty('tests', { status: 'failed' }, now).body).toBe('This run failed before it got to the test stage.');
    expect(describeEmpty('epochs', { status: 'failed' }, now).body).toBe('This run failed before it finished an epoch.');
    expect(describeEmpty('visualizations', { status: 'stalled', lastSeenAt: '2026-10-02T10:00:00Z' }, now)).toEqual({
      title: 'No visualizations yet',
      body: 'This run has stopped reporting (last heard 2 h ago), so visualizations may never arrive. It may have crashed or lost its connection.'
    });
    expect(describeEmpty('epochs', { status: 'stalled' }, now).body).not.toMatch(/last heard/);
  });

  it('describes the first epoch for a running run, and stays general when the run is unknown', () => {
    expect(describeEmpty('epochs', { status: 'running' }, now).body).toBe('This run is training. The first epoch appears here when it finishes one.');
    expect(describeEmpty('tests').body).toBe('The test results are reported by the test stage.');
  });
});
