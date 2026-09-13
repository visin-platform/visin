import { describe, it, expect } from 'vitest';
import { VISIN_FEDERATION_SHARED, VISIN_REMOTE_ENTRY, VISIN_REMOTE_MODULE } from './federation';

describe('VISIN_FEDERATION_SHARED', () => {
  // Each of these holds React context or global state. A remote that ran its own
  // copy would break hooks (React) or read an empty context from the host's
  // providers (router, Emotion theme, React Query), so dropping one from the
  // list is a runtime failure no build catches.
  it.each(['react', 'react-dom', 'react-router-dom', '@emotion/react', '@emotion/styled', '@mui/material', '@tanstack/react-query'])(
    'shares %s as a singleton',
    (pkg) => {
      expect(VISIN_FEDERATION_SHARED).toHaveProperty([pkg, 'singleton'], true);
    }
  );
});

describe('remote conventions', () => {
  it('names the entry file nginx serves uncached, and the module the shell loads', () => {
    expect(VISIN_REMOTE_ENTRY).toBe('remoteEntry.js');
    expect(VISIN_REMOTE_MODULE).toBe('./App');
  });
});
