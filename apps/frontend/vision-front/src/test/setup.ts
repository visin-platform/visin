import '@testing-library/jest-dom';
import { act } from '@testing-library/react';
import { notifyManager } from '@tanstack/react-query';

// React Query defers query-subscriber notifications by one tick (via a `setTimeout(fn, 0)`
// scheduler), so the resulting state update lands outside whatever `act()` call triggered it,
// causing spurious "not wrapped in act(...)" warnings across the suite. Wrapping the notify
// function itself in `act()` is TanStack Query's documented fix for RTL test environments:
// https://tanstack.com/query/latest/docs/framework/react/guides/testing
notifyManager.setNotifyFunction((fn) => {
  act(fn);
});
