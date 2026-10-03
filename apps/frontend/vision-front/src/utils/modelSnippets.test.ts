import { describe, it, expect } from 'vitest';
import { hubReference, loadSnippet, predictSnippet, spaceSnippet } from './modelSnippets';

const model = { repo: 'acme/clftv2-zod', revision: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' };

describe('modelSnippets', () => {
  it('names the repo at the commit the run produced', () => {
    expect(hubReference(model)).toBe(`hf://acme/clftv2-zod@${model.revision}`);
  });

  it('uses the recorded checkpoint path in every loading command', () => {
    const checkpoint = { ...model, path: 'checkpoints/best.pth' };
    const ref = `hf://${model.repo}@${model.revision}/${checkpoint.path}`;
    expect(hubReference(checkpoint)).toBe(ref);
    expect(loadSnippet(checkpoint)).toContain(`Predictor.from_pretrained("${ref}")`);
    expect(predictSnippet(checkpoint)).toContain(`--checkpoint ${ref} `);
    expect(spaceSnippet(checkpoint)).toContain(`--model ${ref} `);
  });

  it('keeps a checkpoint path with spaces and quotes as one shell argument', () => {
    const checkpoint = { ...model, path: 'checkpoints/"best" model\'s.pth' };
    const argument = `'hf://${model.repo}@${model.revision}/checkpoints/"best" model'\\''s.pth'`;
    expect(predictSnippet(checkpoint)).toContain(`--checkpoint ${argument} `);
    expect(spaceSnippet(checkpoint)).toContain(`--model ${argument} `);
    expect(loadSnippet(checkpoint)).toContain(JSON.stringify(hubReference(checkpoint)));
  });

  it('loads the model in Python, pinned', () => {
    expect(loadSnippet(model)).toContain(`Predictor.from_pretrained("hf://acme/clftv2-zod@${model.revision}")`);
  });

  it('predicts a folder from the command line, pinned', () => {
    expect(predictSnippet(model)).toBe(
      `visin-fusion predict --checkpoint hf://acme/clftv2-zod@${model.revision} --input camera/ --output predictions/`
    );
  });

  it('creates a demo Space named after the model', () => {
    expect(spaceSnippet(model)).toBe(
      `visin-fusion space --model hf://acme/clftv2-zod@${model.revision} --space acme/clftv2-zod-demo`
    );
  });
});
