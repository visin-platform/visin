import { HUB } from '../providers/huggingFace';
import { VISIN, storedCheckpointKey, storedModelBlock, storedModelLabel } from '../providers/visin';
import type { RegistryModel } from '../types/modelRegistry';
import type { HubModelReference, ModelReference, StoredModelReference } from '../types/training';
import { shortRevision } from './hubLinks';

export const isHubModel = (model: ModelReference): model is HubModelReference => model.provider === HUB;
export const isStoredModel = (model: ModelReference): model is StoredModelReference => model.provider === VISIN;

/** The stored models of a run, one group per checkpoint: a `.pth` and the ONNX export made from it go together. */
export const storedCheckpoints = (models: ModelReference[]): StoredModelReference[][] => {
  const groups = new Map<string, StoredModelReference[]>();
  for (const model of models.filter(isStoredModel)) {
    const key = storedCheckpointKey(model);
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }
  return [...groups.values()];
};

/**
 * The format a checkpoint's outputs are described from: the `.pth` the export was made from when it can be served,
 * else any format that can. None while every format is still being read, failed, or states no licence.
 */
export const servableModel = (checkpoint: StoredModelReference[]): StoredModelReference | undefined =>
  checkpoint.find((model) => model.format === 'pth' && !storedModelBlock(model)) ??
  checkpoint.find((model) => !storedModelBlock(model));

/** A linked model as one line to a person: the repo and commit on the Hub, or the file this deployment keeps. */
export const modelTitle = (model: ModelReference): string =>
  isHubModel(model) ? `${model.repo} @ ${shortRevision(model.revision)}` : storedModelLabel(model);

/** A registry row, with every format of its checkpoint when it is one this deployment keeps. */
export interface GroupedModelRow {
  row: RegistryModel;
  /** the stored formats of this checkpoint (`.pth`, `.onnx`); empty for a pointer to the Hub */
  stored: StoredModelReference[];
}

/**
 * One row per checkpoint, not per file: a `.pth` and the ONNX export made from it name the same weights, so they
 * are one model with two downloads. The server pages whole checkpoints, keeping every format in the same response.
 */
export const groupModelRows = (rows: RegistryModel[]): GroupedModelRow[] => {
  const grouped = new Map<string, GroupedModelRow>();
  const result: GroupedModelRow[] = [];
  for (const row of rows) {
    const { model } = row;
    if (!isStoredModel(model)) {
      result.push({ row, stored: [] });
      continue;
    }
    const key = `${row.training._id}:${storedCheckpointKey(model)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.stored.push(model);
      continue;
    }
    const created: GroupedModelRow = { row, stored: [model] };
    grouped.set(key, created);
    result.push(created);
  }
  return result;
};
