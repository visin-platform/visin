import { describe, expect, it } from 'vitest';
import { glossaryFor } from '../glossary';
import { resolveTaxonomy } from '../resolveTaxonomy';

describe('glossaryFor', () => {
  it('finds a metric however its key is spelled', () => {
    const meant = glossaryFor('mIoU');
    expect(meant).toMatch(/Mean IoU/);
    expect(glossaryFor('miou')).toBe(meant);
    expect(glossaryFor('mean_iou')).toBe(meant);
    expect(glossaryFor('mAP_50_95')).toMatch(/50% to 95%/);
    expect(glossaryFor('throughput_fps')).toMatch(/Frames per second/);
  });

  it('knows nothing about a key nobody defined', () => {
    expect(glossaryFor('weld_quality')).toBeUndefined();
  });
});

describe('metric descriptions', () => {
  it('fall back to the glossary for an unconfigured metric', () => {
    expect(resolveTaxonomy(undefined).metric('fps').description).toMatch(/Frames per second/);
    expect(resolveTaxonomy(undefined).metric('weld_quality').description).toBeUndefined();
  });

  it("prefer the project's own wording", () => {
    const taxonomy = resolveTaxonomy({ metrics: [{ key: 'fps', description: '  Images per second on the line camera.  ' }] });
    expect(taxonomy.metric('fps').description).toBe('Images per second on the line camera.');
  });

  it('read a configured description for a metric the glossary lacks', () => {
    const taxonomy = resolveTaxonomy({ metrics: [{ key: 'weld_quality', description: 'Share of welds an inspector would pass.' }] });
    expect(taxonomy.metric('weld_quality').description).toBe('Share of welds an inspector would pass.');
  });
});
