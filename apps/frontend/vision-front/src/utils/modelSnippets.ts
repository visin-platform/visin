import type { ModelReference } from '../types/training';
import { shellArgument } from './snippetQuotes';

type Checkpoint = Pick<ModelReference, 'repo' | 'revision' | 'path'>;

/** `hf://org/name@commit[/path]`: the exact checkpoint visin-fusion should read. */
export const hubReference = (model: Checkpoint): string =>
  `hf://${model.repo}@${model.revision}${model.path ? `/${model.path}` : ''}`;

/** Load the model in Python, for any code that wants the predictions. */
export const loadSnippet = (model: Checkpoint): string =>
  [
    'from visin_fusion.inference import Predictor',
    '',
    `predictor = Predictor.from_pretrained(${JSON.stringify(hubReference(model))})`,
    'mask = predictor.predict("camera/000001.png", "lidar_png/000001.png")  # [H, W] class indices',
    'overlay = predictor.overlay("camera/000001.png", mask)'
  ].join('\n');

/** Predict a folder of images from the command line. */
export const predictSnippet = (model: Checkpoint): string =>
  `visin-fusion predict --checkpoint ${shellArgument(hubReference(model))} --input camera/ --output predictions/`;

/** Publish a browser demo anyone can try, without a Visin account. */
export const spaceSnippet = (model: Checkpoint): string =>
  `visin-fusion space --model ${shellArgument(hubReference(model))} --space ${model.repo}-demo`;
