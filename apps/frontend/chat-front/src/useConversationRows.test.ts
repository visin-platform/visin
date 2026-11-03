import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useConversationRows } from './useConversationRows';
it('never renders a late private response under another user or conversation', () => {
  const { result, rerender } = renderHook(({ key }) => useConversationRows<string>(key), {
    initialProps: { key: 'alice:private' }
  });
  act(() => result.current[1](['Private experiment result']));
  const latePrivateResponse = result.current[1];
  rerender({ key: 'alice:shared' });
  expect(result.current[0]).toEqual([]);
  act(() => latePrivateResponse(['Late private result']));
  expect(result.current[0]).toEqual([]);
  act(() => result.current[1]((rows) => [...rows, 'Shared discussion']));
  expect(result.current[0]).toEqual(['Shared discussion']);
  rerender({ key: 'bob:shared' });
  expect(result.current[0]).toEqual([]);
});
