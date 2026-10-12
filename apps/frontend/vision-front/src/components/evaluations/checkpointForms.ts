import type { Checkpoint } from '../../types/evaluation';
import type { ModelLinkProvider } from '../../types/providers';
import type { ModelReference } from '../../types/training';
import { HUB, hubCheckpointForm, hubLinkAnswers, hubLinkCheckpoint } from '../../providers/huggingFace';
import { VISIN, storedLinkAnswers, storedLinkCheckpoint } from '../../providers/visin';

/**
 * The form for each kind of checkpoint: what to ask, and how the answers become one. The promote dialog draws
 * whatever is here, so a new kind of checkpoint adds an entry and no branch to the dialog.
 */
export interface CheckpointField {
  key: string;
  label: string;
  required?: boolean;
  helperText?: string;
  placeholder?: string;
}

/** What a person has typed into a form, by field key. */
export type CheckpointFormValues = Record<string, string>;

export interface CheckpointForm {
  /** the toggle that picks this kind */
  choice: string;
  fields: CheckpointField[];
  build(values: CheckpointFormValues): Checkpoint;
}

const text = (values: CheckpointFormValues, key: string) => (values[key] ?? '').trim();

export const checkpointForms: { [K in Checkpoint['kind']]: CheckpointForm } = {
  local: {
    choice: 'On my machine',
    fields: [
      { key: 'sha256', label: 'SHA-256 of the weights', required: true, helperText: 'From sha256sum on the checkpoint file that was loaded.' },
      { key: 'label', label: 'Label', required: true, helperText: 'A name for people, such as clftv2-epoch-40.' }
    ],
    build: values => ({ kind: 'local', sha256: text(values, 'sha256'), label: text(values, 'label') })
  },
  [HUB]: hubCheckpointForm
};

/** Whether every required answer for this kind of checkpoint has been given. */
export const checkpointFormComplete = (kind: Checkpoint['kind'], values: CheckpointFormValues): boolean =>
  checkpointForms[kind].fields.every(field => !field.required || text(values, field.key) !== '');

/**
 * What a run's link to a model says about the checkpoint form: which kind of checkpoint it stands for, the answers it
 * gives to that kind's form, and the checkpoint itself. Keyed by the store the model is linked from.
 */
export interface ModelLinkCheckpoint<L extends ModelReference = ModelReference> {
  kind: Checkpoint['kind'];
  answers(link: L): CheckpointFormValues;
  checkpoint(link: L): Checkpoint;
}

export const modelLinkCheckpoints: { [K in ModelLinkProvider]: ModelLinkCheckpoint<Extract<ModelReference, { provider: K }>> } = {
  [HUB]: { kind: HUB, answers: hubLinkAnswers, checkpoint: hubLinkCheckpoint },
  // Bytes kept here are named by the digest of the weights, which is what a `local` checkpoint is.
  [VISIN]: { kind: 'local', answers: storedLinkAnswers, checkpoint: storedLinkCheckpoint }
};

const standsFor = (link: ModelReference) => modelLinkCheckpoints[link.provider] as ModelLinkCheckpoint;

/** The kind of checkpoint a run's link stands for, whichever store it is on. */
export const linkCheckpointKind = (link: ModelReference): Checkpoint['kind'] => standsFor(link).kind;

/** The answers a run's link gives to its kind's checkpoint form. */
export const linkCheckpointAnswers = (link: ModelReference): CheckpointFormValues => standsFor(link).answers(link);

/** The checkpoint a run's link stands for. */
export const linkCheckpoint = (link: ModelReference): Checkpoint => standsFor(link).checkpoint(link);
