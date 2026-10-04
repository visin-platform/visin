import { describe, expect, it } from 'vitest';
import { checkpointLabel, evidenceLabel, formatScore, reasonText, STATE_META } from './verdict';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';

describe('reasonText', () => {
  it.each([
    [{ code: 'no-suite' }, 'No suite was named'],
    [{ code: 'evaluation-failed' }, 'The run failed'],
    [{ code: 'results-not-an-object' }, 'not an object of conditions'],
    [{ code: 'no-checkpoint' }, 'does not say which checkpoint'],
    [{ code: 'missing-condition', detail: 'night' }, 'The “night” condition has no results.'],
    [{ code: 'missing-metric', detail: 'night/mIoU' }, 'The “night” condition has no number for “mIoU”.'],
    [{ code: 'missing-sample-count', detail: 'day' }, 'how many samples “day” scored'],
    [{ code: 'missing-overall', detail: 'mIoU' }, 'overall “mIoU”'],
    [{ code: 'protocol-mismatch' }, 'different protocol'],
    [{ code: 'metric-out-of-range', detail: 'night/mIoU' }, '“mIoU” in “night” is outside the range'],
    [{ code: 'sample-count-mismatch', detail: 'night' }, '“night” scored a different number of samples'],
    [{ code: 'submitted-overall-differs', detail: 'mIoU' }, 'differs from the one computed'],
    [{ code: 'no-data-evidence' }, 'did not say which data'],
    [{ code: 'data-mismatch', detail: 'manifestSha256' }, 'not the data this suite pins (manifestSha256 differs)'],
    [{ code: 'no-protocol-evidence' }, 'digest of the protocol it ran'],
    [{ code: 'no-evaluator-evidence' }, 'which package and version'],
    [{ code: 'evaluator-mismatch', detail: 'other' }, '“other”, not the evaluator this suite names'],
    [{ code: 'evaluator-unsupported', detail: 'p 0.9 < 1.0' }, 'older than the suite allows (p 0.9 < 1.0)'],
    [{ code: 'class-mismatch', detail: 'ignored' }, 'ignored classes differ'],
    [{ code: 'class-mismatch', detail: 'scored' }, 'scored classes differ'],
    [{ code: 'future-code', detail: 'x' }, 'future-code: x'],
    [{ code: 'future-code' }, 'future-code']
  ])('says %j in words', (reason, text) => {
    expect(reasonText(reason)).toContain(text);
  });
});

describe('evidenceLabel', () => {
  it('names each level, and reads a report from the first rules as carrying none', () => {
    expect([evidenceLabel('observed'), evidenceLabel('reported'), evidenceLabel('attested'), evidenceLabel('none'), evidenceLabel(undefined)]).toEqual(['Observed', 'Reported', 'Attested', 'Not ranked', 'Not ranked']);
  });
});

describe('checkpointLabel', () => {
  it('names a Hub checkpoint by repo and short commit, with the file, and a local one by its label', () => {
    expect(checkpointLabel({ kind: 'hf', repo: 'acme/clft', commit: COMMIT })).toBe('acme/clft @ 3f2a1c9');
    expect(checkpointLabel({ kind: 'hf', repo: 'acme/clft', commit: COMMIT, path: 'best.pt' })).toBe('acme/clft @ 3f2a1c9 · best.pt');
    expect(checkpointLabel({ kind: 'local', sha256: 'a'.repeat(64), label: 'epoch 40' })).toBe('epoch 40');
    expect(checkpointLabel(undefined)).toBe('Unknown checkpoint');
  });
});

describe('formatScore', () => {
  it('keeps four significant digits and drops trailing zeros, and keeps a zero', () => {
    expect(formatScore(0.7350000001)).toBe('0.735');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(12.34567)).toBe('12.35');
  });
});

describe('STATE_META', () => {
  it('has a label and a meaning for every state', () => {
    for (const meta of Object.values(STATE_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.meaning).toBeTruthy();
    }
  });
});
