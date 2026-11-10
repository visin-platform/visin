import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationToggle } from './NotificationToggle';

const push = vi.hoisted(() => ({
  pushSupport: vi.fn(),
  hasWorker: vi.fn(),
  isSubscribed: vi.fn(),
  pushConfig: vi.fn(),
  enableNotifications: vi.fn(),
  disableNotifications: vi.fn()
}));
vi.mock('../../services/pushNotifications', () => push);

beforeEach(() => {
  Object.values(push).forEach((fn) => fn.mockReset());
  push.pushSupport.mockReturnValue('needs-permission');
  push.hasWorker.mockResolvedValue(true);
  push.isSubscribed.mockResolvedValue(false);
  push.pushConfig.mockResolvedValue({ enabled: true, publicKey: 'k' });
});

describe('NotificationToggle', () => {
  it('is not offered where the server cannot send', async () => {
    push.pushConfig.mockResolvedValue({ enabled: false, publicKey: null });
    const { container } = render(<NotificationToggle />);
    await waitFor(() => expect(push.pushConfig).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('is not offered where there is nothing to deliver to', async () => {
    push.hasWorker.mockResolvedValue(false);
    const { container } = render(<NotificationToggle />);
    await waitFor(() => expect(push.hasWorker).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    push.pushSupport.mockReturnValue('unsupported');
    render(<NotificationToggle />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns notifications on from the tap, and says so', async () => {
    push.enableNotifications.mockImplementation(async () => {
      push.pushSupport.mockReturnValue('ready');
      return 'ready';
    });
    render(<NotificationToggle />);
    const button = await screen.findByRole('button', { name: 'Turn on notifications' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Turn off notifications' })).toHaveAttribute('aria-pressed', 'true');
    expect(push.enableNotifications).toHaveBeenCalledTimes(1);
  });

  it('turns them off again', async () => {
    push.pushSupport.mockReturnValue('ready');
    push.isSubscribed.mockResolvedValue(true);
    render(<NotificationToggle />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off notifications' }));
    expect(push.disableNotifications).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('stays off when the person declines the browser’s prompt', async () => {
    push.enableNotifications.mockResolvedValue('denied');
    render(<NotificationToggle />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() => expect(push.enableNotifications).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows what went wrong instead of failing silently', async () => {
    push.enableNotifications.mockRejectedValue(new Error('This server is not set up to send notifications.'));
    render(<NotificationToggle />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('This server is not set up to send notifications.')).toBeInTheDocument();
  });

  it.each(['denied', 'needs-install', 'insecure'])(
    'explains rather than asking when notifications cannot work (%s)',
    async (support) => {
      push.pushSupport.mockReturnValue(support);
      render(<NotificationToggle />);
      const button = await screen.findByRole('button', { name: 'Notifications unavailable' });
      await userEvent.click(button);
      expect(push.enableNotifications).not.toHaveBeenCalled();
    }
  );
});
