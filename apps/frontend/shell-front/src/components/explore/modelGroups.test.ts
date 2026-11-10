import { describe, expect, it } from 'vitest';
import type { ExploreModel } from '../../services/exploreApi';
import { groupFormats } from './modelGroups';

const row = (id: string, filename: string | undefined, format: 'pth' | 'onnx', run = 't1'): ExploreModel => ({
  model: { _id: id, provider: 'visin', filename, format, status: 'ready', addedAt: '2026-10-12T00:00:00Z' },
  training: { _id: run, name: 'run' }
});

describe('groupFormats', () => {
  it('shows a checkpoint stored in two formats once, naming both', () => {
    const groups = groupFormats([
      row('1', 'net-epoch176.onnx', 'onnx'),
      row('2', 'net-epoch176.pth', 'pth'),
      row('3', 'net-epoch75.onnx', 'onnx')
    ]);
    expect(groups.map((group) => group.row.model._id)).toEqual(['1', '3']);
    expect(groups[0].formats).toEqual(['onnx', 'pth']);
    expect(groups[1].formats).toEqual(['onnx']);
  });

  it('keeps the same file name on two different runs apart, and never merges rows with no file name', () => {
    const groups = groupFormats([
      row('1', 'net.pth', 'pth', 'a'),
      row('2', 'net.onnx', 'onnx', 'b'),
      row('3', undefined, 'pth'),
      row('4', undefined, 'onnx')
    ]);
    expect(groups).toHaveLength(4);
  });
});
