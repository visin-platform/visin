import type { Checkpoint } from '../models/Evaluation';
import { checkpointKey as keyOf } from './sourceRegistry';

/**
 * The canonical key of a checkpoint: what makes two evaluations the same model. Each kind of checkpoint says how
 * it is keyed in the source registry (a Hub checkpoint is its repo, its full commit and the file inside it; a local
 * one is the digest of the weights, so a rename or a move changes nothing and a different file never collides).
 */
export const checkpointKey = (checkpoint: Checkpoint): string => keyOf(checkpoint);
