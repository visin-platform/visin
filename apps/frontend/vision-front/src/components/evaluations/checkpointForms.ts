import type { Checkpoint } from '../../types/evaluation';
import type { ModelLinkProvider } from '../../types/providers';
import type { ModelReference } from '../../types/training';
import { HUB, hubCheckpointForm, hubLinkAnswers, hubLinkCheckpoint } from '../../providers/huggingFace';

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
export interface ModelLinkCheckpoint {
  kind: Checkpoint['kind'];
  answers(link: ModelReference): CheckpointFormValues;
  checkpoint(link: ModelReference): Checkpoint;
}

export const modelLinkCheckpoints: { [K in ModelLinkProvider]: ModelLinkCheckpoint } = {
  [HUB]: { kind: HUB, answers: hubLinkAnswers, checkpoint: hubLinkCheckpoint }
};
