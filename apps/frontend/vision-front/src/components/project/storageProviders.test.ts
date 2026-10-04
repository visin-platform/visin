import { describe, expect, it } from 'vitest';
import { STORAGE_PROVIDERS } from '../../types/providers';
import { storageChoices, storageProviders, switchProvider, withSetting } from './storageProviders';

describe('storage providers', () => {
  it('say how every provider in the list reads, in the list\'s order', () => {
    expect(storageChoices.map(choice => choice.provider)).toEqual([...STORAGE_PROVIDERS]);
    expect(Object.keys(storageProviders).sort()).toEqual([...STORAGE_PROVIDERS].sort());
  });

  it('keep a setting only on a provider that has it', () => {
    expect(storageProviders.hf.settings?.map(setting => setting.key)).toEqual(['namespace']);
    expect(storageProviders.visin.settings).toBeUndefined();
    expect(switchProvider('hf', { provider: 'visin', settings: { namespace: 'acme' } })).toEqual({ provider: 'hf', settings: { namespace: 'acme' } });
    expect(switchProvider('hf', { provider: 'visin' })).toEqual({ provider: 'hf' });
    expect(switchProvider('visin', { provider: 'hf', settings: { namespace: 'acme' } })).toEqual({ provider: 'visin' });
  });

  it('change one setting, trimmed, and drop it, and the settings with it, when it is emptied', () => {
    expect(withSetting({ provider: 'hf' }, 'namespace', ' acme ')).toEqual({ provider: 'hf', settings: { namespace: 'acme' } });
    expect(withSetting({ provider: 'hf', settings: { namespace: 'acme', other: 'x' } }, 'namespace', '')).toEqual({ provider: 'hf', settings: { other: 'x' } });
    expect(withSetting({ provider: 'hf', settings: { namespace: 'acme' } }, 'namespace', '  ')).toEqual({ provider: 'hf' });
  });
});
