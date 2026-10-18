import type { Checkpoint } from '../types/evaluation';
import type { CheckpointFormValues } from '../components/evaluations/checkpointForms';
import { visionApiOrigin } from '../config/visionApi';

/**
 * A model whose bytes this deployment keeps itself: a checkpoint a run uploaded, as `.pth` weights or an `.onnx`
 * export. The API's `StoredModelReference`. It is served only once its file has been read (`ready`) and its
 * publisher has stated a licence.
 */
export const VISIN = 'visin' as const;

export type StoredModelFormat = 'pth' | 'onnx';
export type StoredModelStatus = 'verifying' | 'ready' | 'failed';

export interface StoredModelLink {
  provider: typeof VISIN;
  kind: 'model';
  fileId: string;
  filename?: string;
  format: StoredModelFormat;
  size?: number;
  sha256?: string;
  /** for an ONNX export: the `.pth` it was made from */
  sourceSha256?: string;
  status?: StoredModelStatus;
  verifyError?: string;
  license?: { id: string; name?: string; url?: string };
  credit?: string;
  /** what the weights record about the network and its input */
  modelInfo?: StoredModelInfo;
  parity?: { maxAbsDiff: number; argmaxMismatchFraction: number; frames: number };
}

/** The parts of a checkpoint's `model_info` the page reads; the rest is kept as sent. */
export interface StoredModelInfo {
  backbone?: string;
  mode?: string;
  dataset?: string;
  train_classes?: Array<{ name: string; index: number }>;
  transforms?: {
    resize?: number;
    image_mean?: number[];
    image_std?: number[];
    lidar_mean?: number[];
    lidar_std?: number[];
  };
  [key: string]: unknown;
}

export const FORMAT_LABELS: Record<StoredModelFormat, string> = { pth: 'PyTorch (.pth)', onnx: 'ONNX (.onnx)' };

/** Where a stored model's file is downloaded from; the browser sends its session along on a plain link. */
export const storedModelFileUrl = (trainingId: string, modelId: string): string =>
  `${visionApiOrigin()}/api/trainings/${trainingId}/models/${modelId}/file`;

/** The page that shows what a stored model produced on its frames, its scores and where it came from. */
export const storedModelOutputsPath = (trainingId: string, modelId: string): string =>
  `/trainings/${trainingId}/models/${modelId}`;

/**
 * The classes a run's masks index, from what its stored weights record (`train_classes`): those of the checkpoint at
 * `epoch` when it names any, else of any checkpoint that does. Empty when no checkpoint says.
 */
export const outputClassesOf = (
  models: ReadonlyArray<{ provider?: string; epoch?: number; modelInfo?: StoredModelInfo }> | undefined,
  epoch?: number
): Array<{ index: number; name: string }> => {
  const named = (models ?? []).filter(
    (model) => model.provider === VISIN && Array.isArray(model.modelInfo?.train_classes)
  );
  const chosen = named.find((model) => epoch !== undefined && model.epoch === epoch) ?? named[0];
  return (chosen?.modelInfo?.train_classes ?? [])
    .filter((entry) => Number.isInteger(entry?.index) && typeof entry?.name === 'string')
    .map(({ index, name }) => ({ index, name }))
    .sort((a, b) => a.index - b.index);
};

/** Why a stored model cannot be downloaded, or `undefined` when it can. */
export const storedModelBlock = (
  link: Pick<StoredModelLink, 'status' | 'license' | 'verifyError'>
): string | undefined => {
  if (link.status === 'failed') return `Failed verification${link.verifyError ? `: ${link.verifyError}` : ''}`;
  if (link.status !== 'ready') return 'Being verified';
  if (!link.license) return 'Licence not stated';
  return undefined;
};

/**
 * Both formats of one checkpoint are one model: the `.pth` and the ONNX export made from it name the same digest.
 * A model not yet read has none, and stands alone.
 */
export const storedCheckpointKey = (
  link: Pick<StoredModelLink, 'fileId' | 'sha256' | 'sourceSha256' | 'format'>
): string => (link.format === 'pth' ? link.sha256 : link.sourceSha256) ?? `pending-${link.fileId}`;

/** What a stored model is, to a person: its file name, or its format when it has none. */
export const storedModelLabel = (link: Pick<StoredModelLink, 'filename' | 'format'>): string =>
  link.filename ?? `${link.format} checkpoint`;

/** The checkpoint a stored model stands for, as an evaluation names it: the digest of the weights. */
export const storedLinkCheckpoint = (
  link: Pick<StoredModelLink, 'fileId' | 'sha256' | 'sourceSha256' | 'format' | 'filename'>
): Checkpoint => ({
  kind: 'local',
  sha256: storedCheckpointKey(link),
  label: storedModelLabel(link)
});

/** The answers a stored model gives to the "on my machine" checkpoint form. */
export const storedLinkAnswers = (
  link: Pick<StoredModelLink, 'fileId' | 'sha256' | 'sourceSha256' | 'format' | 'filename'>
): CheckpointFormValues => ({
  sha256: storedCheckpointKey(link),
  label: storedModelLabel(link)
});

const numbers = (values: unknown): string | undefined =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every((value) => typeof value === 'number' && Number.isFinite(value))
    ? values.map((value) => Number(value.toPrecision(4))).join(', ')
    : undefined;

/** What a consumer must do to an input before the model sees it, from what the weights record about themselves. */
export const preprocessingText = (info: StoredModelInfo | undefined): string | undefined => {
  const transforms = info?.transforms;
  if (!transforms || typeof transforms !== 'object') return undefined;
  const parts = [
    typeof transforms.resize === 'number' && Number.isFinite(transforms.resize) && transforms.resize > 0
      ? `input ${transforms.resize} px`
      : undefined,
    numbers(transforms.image_mean) ? `camera mean ${numbers(transforms.image_mean)}` : undefined,
    numbers(transforms.image_std) ? `std ${numbers(transforms.image_std)}` : undefined,
    numbers(transforms.lidar_mean) ? `LiDAR mean ${numbers(transforms.lidar_mean)}` : undefined,
    numbers(transforms.lidar_std) ? `std ${numbers(transforms.lidar_std)}` : undefined
  ];
  return parts.filter(Boolean).join(' · ') || undefined;
};
