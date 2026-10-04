import { compareVersions } from '../../services/evaluatorVersion';

describe('compareVersions', () => {
  it('orders dotted numbers numerically, treating a missing part as zero', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
    expect(compareVersions('v2', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.3.9', '1.4.0')).toBeLessThan(0);
  });

  it('sorts a pre-release below the same number, and ignores a local build tag', () => {
    expect(compareVersions('1.4.0rc1', '1.4.0')).toBeLessThan(0);
    expect(compareVersions('1.4.0.dev3', '1.4.0')).toBeLessThan(0);
    expect(compareVersions('1.4.0-beta', '1.4.0')).toBeLessThan(0);
    expect(compareVersions('1.4.0', '1.4.0rc1')).toBeGreaterThan(0);
    expect(compareVersions('1.4.0+cu121', '1.4.0')).toBe(0);
    expect(compareVersions('1.5.0rc1', '1.4.0')).toBeGreaterThan(0);
  });

  it('gives nothing for a version that does not start with a number', () => {
    expect(compareVersions('main', '1.0')).toBeUndefined();
    expect(compareVersions('1.0', 'latest')).toBeUndefined();
    expect(compareVersions('', '1.0')).toBeUndefined();
  });

  it('sorts a post-release at or above its release, never below it', () => {
    expect(compareVersions('1.4.2.post1', '1.4.2')).toBeGreaterThanOrEqual(0);
    expect(compareVersions('1.4.2-post3', '1.4.2')).toBeGreaterThanOrEqual(0);
    expect(compareVersions('1.4.1.post9', '1.4.2')).toBeLessThan(0);
  });

  it('knows each way a pre-release is spelled, and does not take a word that merely starts with one for it', () => {
    for (const suffix of ['a1', 'b2', 'c1', 'rc1', '.dev3', '-alpha', '-beta.2', '.preview1', '-pre']) {
      expect(compareVersions(`1.4.0${suffix}`, '1.4.0')).toBeLessThan(0);
    }
    expect(compareVersions('1.4.0-custom', '1.4.0')).toBe(0);
    expect(compareVersions('1.4.0.betamax', '1.4.0')).toBe(0);
  });
});
