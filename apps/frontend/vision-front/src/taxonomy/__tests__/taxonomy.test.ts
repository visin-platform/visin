import { describe, expect, it } from 'vitest';
import { TestResult } from '../../types/testResult';
import { Epoch } from '../../types/epoch';
import {
  discoverClassMetrics,
  discoverClasses,
  discoverConditions,
  discoverEpochClasses,
  discoverOverallMetrics,
  readMetric
} from '../discover';
import { orderKeysByTaxonomy, resolveTaxonomy } from '../resolveTaxonomy';
import { humanize } from '../humanize';

/**
 * Two vocabularies throughout: the automotive one this platform grew up on, and a
 * manufacturing one it had never seen. Anything that passes for `weather` but not
 * for `line` has hard-coding left in it.
 */
const weatherResult = {
  test_results: {
    day_fair: {
      vehicle: { iou: 0.8, precision: 0.9, recall: 0.7, f1_score: 0.8, ap: 0.85 },
      human: { iou: 0.6, precision: 0.7, recall: 0.5, f1_score: 0.6, ap: 0.65 },
      overall: { mIoU_foreground: 0.7, mean_accuracy: 0.9, fw_iou: 0.8, pixel_accuracy: 0.95 },
      inference_time: { avg_per_sample_ms: 12.5, throughput_fps: 80 }
    },
    snow: {
      vehicle: { iou: 0.5, precision: 0.6, recall: 0.4, f1_score: 0.5, ap: 0.55 },
      overall: { mIoU_foreground: 0.5, mean_accuracy: 0.7, fw_iou: 0.6, pixel_accuracy: 0.8 }
    }
  }
} as unknown as TestResult;

const factoryResult = {
  test_results: {
    line_a: {
      scratch: { iou: 0.4, precision: 0.5, recall: 0.3 },
      dent: { iou: 0.9, precision: 0.95, recall: 0.85 },
      overall: { mean_dice: 0.65 }
    },
    line_b: {
      scratch: { iou: 0.45, precision: 0.55, recall: 0.35 },
      overall: { mean_dice: 0.7 }
    }
  }
} as unknown as TestResult;

describe('discovery', () => {
  it('finds conditions without knowing the vocabulary', () => {
    expect(discoverConditions([weatherResult]).sort()).toEqual(['day_fair', 'snow']);
    expect(discoverConditions([factoryResult]).sort()).toEqual(['line_a', 'line_b']);
  });

  it('finds classes and skips the reserved keys beside them', () => {
    expect(discoverClasses([weatherResult]).sort()).toEqual(['human', 'vehicle']);
    expect(discoverClasses([factoryResult]).sort()).toEqual(['dent', 'scratch']);
  });

  it('finds class metrics and overall metrics separately', () => {
    expect(discoverClassMetrics([weatherResult]).sort()).toEqual([
      'ap',
      'f1_score',
      'iou',
      'precision',
      'recall'
    ]);
    expect(discoverOverallMetrics([factoryResult])).toEqual(['mean_dice']);
  });

  it('survives a malformed payload', () => {
    const junk = [{}, { test_results: null }, { test_results: 'nope' }] as unknown as TestResult[];
    expect(discoverConditions(junk)).toEqual([]);
    expect(discoverClasses(junk)).toEqual([]);
  });

  it('finds epoch classes only where the metric is actually present', () => {
    const epochs = [
      {
        epoch: 1,
        results: {
          val: { loss: 0.4, mean_iou: 0.6, turbine: { iou: 0.7 }, blade: { iou: 0.5 } },
          train: { per_class: { turbine: { iou: 0.72 } } }
        }
      }
    ] as unknown as Epoch[];
    expect(discoverEpochClasses(epochs, 'iou').sort()).toEqual(['blade', 'turbine']);
    expect(discoverEpochClasses(epochs, 'ap')).toEqual([]);
  });

  it('unwraps an object-shaped ap and the f1 aliases', () => {
    expect(readMetric({ ap: { mean: 0.42 } }, 'ap')).toBe(0.42);
    expect(readMetric({ mean_f1: 0.3 }, 'f1_score')).toBe(0.3);
    expect(readMetric({ iou: 0.1 }, 'ap')).toBeUndefined();
  });
});

describe('resolveTaxonomy', () => {
  it('falls back to discovery when the project configures nothing', () => {
    const t = resolveTaxonomy(undefined, { conditions: ['line_b', 'line_a'], classes: ['dent'] });
    expect(t.conditions.map(c => c.key)).toEqual(['line_a', 'line_b']);
    expect(t.conditions[0].label).toBe('Line A');
    expect(t.conditionLabel).toBe('Condition');
    expect(t.classes[0].color).toMatch(/^#/);
  });

  it('puts configured terms first in their stated order, then discovered extras', () => {
    const t = resolveTaxonomy(
      {
        conditionLabel: 'Weather',
        conditions: [
          { key: 'snow', label: 'Snowfall', order: 1 },
          { key: 'day_fair', label: 'Fair Day', order: 0 }
        ]
      },
      { conditions: ['snow', 'day_fair', 'fog'] }
    );
    expect(t.conditions.map(c => c.key)).toEqual(['day_fair', 'snow', 'fog']);
    expect(t.conditions.map(c => c.label)).toEqual(['Fair Day', 'Snowfall', 'Fog']);
    expect(t.conditionLabel).toBe('Weather');
  });

  it('keeps a configured term the current data happens to lack', () => {
    const t = resolveTaxonomy({ classes: [{ key: 'dent' }, { key: 'scratch' }] }, { classes: ['dent'] });
    expect(t.classes.map(c => c.key)).toEqual(['dent', 'scratch']);
  });

  describe('metric direction', () => {
    it('treats an unknown metric as higher-is-better', () => {
      const t = resolveTaxonomy(undefined, {});
      expect(t.metric('mystery').direction).toBe('higher');
      expect(t.best('mystery', [0.1, 0.9, 0.5])).toBe(0.9);
    });

    it('knows loss and latency are lower-is-better by default', () => {
      const t = resolveTaxonomy(undefined, {});
      expect(t.metric('loss').direction).toBe('lower');
      expect(t.best('loss', [0.4, 0.1, 0.9])).toBe(0.1);
      expect(t.best('avg_per_sample_ms', [12, 5, 30])).toBe(5);
      expect(t.best('throughput_fps', [12, 5, 30])).toBe(30);
    });

    it('lets a project invert a metric it reports the other way round', () => {
      const t = resolveTaxonomy({ metrics: [{ key: 'error_score', direction: 'lower' }] }, {});
      expect(t.best('error_score', [0.4, 0.1])).toBe(0.1);
      expect(t.isBetter('error_score', 0.1, 0.4)).toBe(true);
    });

    it('ignores non-finite values when picking a best', () => {
      const t = resolveTaxonomy(undefined, {});
      expect(t.best('iou', [NaN, 0.3, Infinity])).toBe(0.3);
      expect(t.best('iou', [])).toBeUndefined();
    });
  });

  it('prefers configured overall metrics over discovered ones', () => {
    const configured = resolveTaxonomy({ overallMetrics: ['fw_iou'] }, { overallMetrics: ['a', 'b'] });
    expect(configured.overallMetrics.map(m => m.key)).toEqual(['fw_iou']);
    const discovered = resolveTaxonomy(undefined, { overallMetrics: ['b', 'a'] });
    expect(discovered.overallMetrics.map(m => m.key)).toEqual(['a', 'b']);
  });
});

describe('humanize', () => {
  it.each([
    ['day_fair', 'Day Fair'],
    ['iou', 'IoU'],
    ['fw_iou', 'FW IoU'],
    ['mIoU_foreground', 'mIoU Foreground'],
    ['cyclist + pedestrian', 'Cyclist + Pedestrian'],
    ['throughput_fps', 'Throughput FPS'],
    ['line_a', 'Line A']
  ])('%s -> %s', (input, expected) => {
    expect(humanize(input)).toBe(expected);
  });
});

describe('orderKeysByTaxonomy', () => {
  const terms = resolveTaxonomy(
    { conditions: [{ key: 'day_fair', order: 0 }, { key: 'night_fair', order: 1 }] },
    {}
  ).conditions;

  it('keeps every key present, configured first then the rest sorted', () => {
    const breakdown = { snow: {}, night_fair: {}, day_fair: {}, fog: {} };
    expect(orderKeysByTaxonomy(terms, breakdown)).toEqual([
      'day_fair',
      'night_fair',
      'fog',
      'snow'
    ]);
  });

  it('does not invent a configured key the record lacks', () => {
    expect(orderKeysByTaxonomy(terms, { day_fair: {} })).toEqual(['day_fair']);
  });

  it('returns nothing for an absent record', () => {
    expect(orderKeysByTaxonomy(terms, undefined)).toEqual([]);
  });
});
