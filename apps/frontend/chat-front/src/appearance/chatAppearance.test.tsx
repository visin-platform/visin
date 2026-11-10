import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppearanceDialog } from './AppearanceDialog';
import { DEFAULT_APPEARANCE, parseAppearance } from './chatAppearance';
import { useChatAppearance } from './useChatAppearance';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it('validates stored preferences and falls back for corrupt or unrecognized values', () => {
  expect(parseAppearance('not-json')).toEqual(DEFAULT_APPEARANCE);
  expect(parseAppearance('{"color":"url(evil)","glass":"yes","compact":9}')).toEqual(DEFAULT_APPEARANCE);
  expect(parseAppearance('{"color":"forest","glass":false,"compact":true}')).toEqual({
    color: 'forest'
  });
});
it('persists changes across mounts, scopes them by account and updates mounted panels', () => {
  const first = renderHook(({ user }) => useChatAppearance(user), { initialProps: { user: 'alice' } });
  const second = renderHook(() => useChatAppearance('alice'));
  act(() => first.result.current.update({ color: 'forest' }));
  expect(second.result.current.settings.color).toBe('forest');
  first.rerender({ user: 'bob' });
  expect(first.result.current.settings).toEqual(DEFAULT_APPEARANCE);
  first.rerender({ user: 'alice' });
  expect(first.result.current.settings.color).toBe('forest');
  act(() => first.result.current.reset());
  expect(second.result.current.settings).toEqual(DEFAULT_APPEARANCE);
});
it('accepts storage events from another tab and works when browser storage is blocked', () => {
  const normal = renderHook(() => useChatAppearance('alice'));
  act(() => {
    localStorage.setItem('visin.chat.appearance.v1:alice', '{"color":"rose"}');
    window.dispatchEvent(new Event('storage'));
  });
  expect(normal.result.current.settings.color).toBe('rose');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const blocked = renderHook(() => useChatAppearance('private-browser'));
  act(() => blocked.result.current.update({ color: 'sunset' }));
  expect(blocked.result.current.settings).toMatchObject({ color: 'sunset' });
});
it('changes colors using a preview, supports keyboard selection and resets controls', () => {
  const close = vi.fn();
  function Harness() {
    const appearance = useChatAppearance('settings-test');
    return <AppearanceDialog open appearance={appearance} onClose={close} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }));
  expect(screen.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Ocean' }), { key: 'ArrowRight' });
  expect(screen.getByRole('radio', { name: 'Forest' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByRole('radio', { name: 'Visin' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(close).toHaveBeenCalled();
});

it('keeps new preferences usable if storage fills up after an earlier successful save', () => {
  localStorage.setItem('visin.chat.appearance.v1:quota-test', '{"color":"forest"}');
  const hook = renderHook(() => useChatAppearance('quota-test'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  act(() => hook.result.current.update({ color: 'rose' }));
  expect(hook.result.current.settings.color).toBe('rose');
});
