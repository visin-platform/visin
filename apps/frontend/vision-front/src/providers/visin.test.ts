import { describe, expect, it } from 'vitest';
import {
  outputClassesOf,
  preprocessingText,
  type StoredModelInfo,
  storedCheckpointKey,
  storedLinkAnswers,
  storedLinkCheckpoint,
  storedModelBlock,
  storedModelLabel,
  storedModelOutputsPath
} from './visin';

const base = { fileId: 'models/t1/a.pth', filename: 'run.pth', format: 'pth' as const };

describe('stored models', () => {
  it('are one checkpoint across formats, named by the .pth’s digest', () => {
    expect(storedCheckpointKey({ ...base, sha256: 'a'.repeat(64) })).toBe('a'.repeat(64));
    expect(storedCheckpointKey({ ...base, format: 'onnx', sha256: 'b'.repeat(64), sourceSha256: 'a'.repeat(64) })).toBe(
      'a'.repeat(64)
    );
    expect(storedCheckpointKey({ ...base, format: 'onnx', sha256: 'b'.repeat(64) })).toBe('pending-models/t1/a.pth');
    expect(storedCheckpointKey(base)).toBe('pending-models/t1/a.pth');
  });

  it('stand for a local checkpoint in the evaluation forms', () => {
    expect(storedLinkCheckpoint({ ...base, sha256: 'a'.repeat(64) })).toEqual({
      kind: 'local',
      sha256: 'a'.repeat(64),
      label: 'run.pth'
    });
    expect(storedLinkAnswers({ ...base, sha256: 'a'.repeat(64) })).toEqual({
      sha256: 'a'.repeat(64),
      label: 'run.pth'
    });
    expect(storedModelLabel({ format: 'onnx' })).toBe('onnx checkpoint');
  });

  it('are blocked until read, when failed, and without a licence, in that order', () => {
    const ready = { status: 'ready' as const, license: { id: 'cc-by-4.0' } };
    expect(storedModelBlock(ready)).toBeUndefined();
    expect(storedModelBlock({ ...ready, status: 'verifying' })).toBe('Being verified');
    expect(storedModelBlock({ ...ready, status: undefined })).toBe('Being verified');
    expect(storedModelBlock({ ...ready, status: 'failed', verifyError: 'bad digest' })).toBe(
      'Failed verification: bad digest'
    );
    expect(storedModelBlock({ ...ready, status: 'failed' })).toBe('Failed verification');
    expect(storedModelBlock({ status: 'ready' })).toBe('Licence not stated');
  });

  it('say what to do to an input, from what the weights record', () => {
    expect(
      preprocessingText({
        transforms: { image_mean: 'not an array', image_std: [0.1, null], resize: '384' }
      } as unknown as StoredModelInfo)
    ).toBeUndefined();
    expect(preprocessingText({ transforms: 'legacy' } as unknown as StoredModelInfo)).toBeUndefined();
    expect(preprocessingText(undefined)).toBeUndefined();
    expect(preprocessingText({ backbone: 'clft' })).toBeUndefined();
    expect(preprocessingText({ transforms: {} })).toBeUndefined();
    expect(
      preprocessingText({
        transforms: {
          resize: 384,
          image_mean: [0.485, 0.456, 0.406],
          image_std: [0.229, 0.224, 0.225],
          lidar_mean: [0.812386, 0.148879, 0.032874],
          lidar_std: [0.194681, 0.285717, 0.153287]
        }
      })
    ).toBe(
      'input 384 px · camera mean 0.485, 0.456, 0.406 · std 0.229, 0.224, 0.225 · LiDAR mean 0.8124, 0.1489, 0.03287 · std 0.1947, 0.2857, 0.1533'
    );
    expect(preprocessingText({ transforms: { resize: 256 } })).toBe('input 256 px');
  });
});

describe('model outputs', () => {
  const classes = (names: string[]) => names.map((name, index) => ({ name, index }));

  it('are a page of their own', () => {
    expect(storedModelOutputsPath('t1', 'm1')).toBe('/trainings/t1/models/m1');
  });

  it('name the classes a mask indexes from the stored weights, preferring the checkpoint at the epoch', () => {
    const models = [
      { provider: 'huggingface', epoch: 5, modelInfo: { train_classes: classes(['hub']) } },
      { provider: 'visin', epoch: 10, modelInfo: { train_classes: [{ name: 'sign', index: 2 }, ...classes(['road', 'car'])] } },
      { provider: 'visin', epoch: 20, modelInfo: { train_classes: classes(['sky']) } },
      { provider: 'visin', epoch: 30 }
    ];
    expect(outputClassesOf(models)).toEqual([
      { index: 0, name: 'road' },
      { index: 1, name: 'car' },
      { index: 2, name: 'sign' }
    ]);
    expect(outputClassesOf(models, 20)).toEqual([{ index: 0, name: 'sky' }]);
    expect(outputClassesOf(models, 99)).toHaveLength(3);
    expect(outputClassesOf(undefined)).toEqual([]);
    expect(outputClassesOf([{ provider: 'visin', modelInfo: { train_classes: [{ name: 'x', index: 0.5 }] } }])).toEqual([]);
  });
});
