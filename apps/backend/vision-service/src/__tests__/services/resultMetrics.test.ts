import { metricLeaves } from '../../services/resultMetrics';
import { epochMetrics } from '../../services/latexExport';

describe('metricLeaves', () => {
  it('keeps the validation results when a pipeline also logs a bare number beside its blocks', () => {
    const leaves = metricLeaves({ lr: 0.0001, epoch_time_s: 312, train: { loss: 0.41 }, val: { loss: 0.38, mean_iou: 0.71 } });
    expect(leaves.map(leaf => leaf.path)).toEqual(['train.loss', 'val.loss', 'val.mean_iou']);
  });

  it('keeps summaries and leaves out the per-class and telemetry rows nested below them', () => {
    const leaves = metricLeaves({
      val: { loss: 0.3, mean_iou: 0.7, vehicle: { iou: 0.5 } },
      train: { vehicle: { iou: 0.9 } },
      system: { gpu: { temperature: 61, memory_used: 9000 }, cpu: { percent: 12 } }
    });
    expect(leaves.map(leaf => leaf.path)).toEqual(['val.loss', 'val.mean_iou']);
  });

  it('counts a result logged at the top level beside its blocks', () => {
    expect(metricLeaves({ accuracy: 0.9, lr: 0.1, val: { loss: 0.3 } }).map(leaf => leaf.path)).toEqual(['accuracy', 'val.loss']);
  });

  it('leaves out per-class rows, telemetry and run bookkeeping', () => {
    const leaves = metricLeaves({ lr: 1, learning_rate: 1, epoch_time: 9, timestamp: 5, system_info: { cpu: 8 }, val: { loss: 0.3, per_class: { vehicle: 0.4 } } });
    expect(leaves.map(leaf => leaf.path)).toEqual(['val.loss']);
  });

  it('still reports a flat result with no blocks', () => {
    expect(metricLeaves({ loss: 0.2, accuracy: 0.9, note: 'text', nan: NaN }).map(leaf => leaf.path)).toEqual(['loss', 'accuracy']);
  });

  it('keeps the keys apart from the path, so a key with a dot can still be addressed', () => {
    expect(metricLeaves({ val: { 'map_0.5': 0.4 } })).toEqual([{ path: 'val.map_0.5', segments: ['val', 'map_0.5'], value: 0.4 }]);
  });

  it('is what epochMetrics reports', () => {
    expect([...epochMetrics({ lr: 1, val: { loss: 0.5 } })]).toEqual([['val.loss', 0.5]]);
  });
});
