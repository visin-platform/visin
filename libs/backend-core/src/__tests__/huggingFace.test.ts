import { HF_COMMIT_PATTERN, HF_NAMESPACE_PATTERN, HF_REPO_PATTERN } from '../huggingFace/ids';

describe('Hugging Face ids', () => {
  it('takes only a full lower-case commit hash as a revision', () => {
    expect(HF_COMMIT_PATTERN.test('a'.repeat(40))).toBe(true);
    for (const bad of ['main', 'v1.0', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), `${'a'.repeat(39)}g`]) {
      expect(HF_COMMIT_PATTERN.test(bad)).toBe(false);
    }
  });

  it('takes a repo as namespace/name', () => {
    for (const good of ['org/name', 'my-org/data_set.v2', 'a/b']) expect(HF_REPO_PATTERN.test(good)).toBe(true);
    for (const bad of ['name', '/name', 'org/', 'org//name', 'org/na me', '-org/name', 'org/name/extra']) {
      expect(HF_REPO_PATTERN.test(bad)).toBe(false);
    }
  });

  it('takes a namespace on its own, with no slash', () => {
    expect(HF_NAMESPACE_PATTERN.test('my-org')).toBe(true);
    expect(HF_NAMESPACE_PATTERN.test('org/name')).toBe(false);
    expect(HF_NAMESPACE_PATTERN.test('')).toBe(false);
  });

  it('bounds a segment to 96 characters', () => {
    expect(HF_NAMESPACE_PATTERN.test('a'.repeat(96))).toBe(true);
    expect(HF_NAMESPACE_PATTERN.test('a'.repeat(97))).toBe(false);
  });
});
