import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@visin/frontend-core', async (original) => ({
  ...(await original<typeof import('@visin/frontend-core')>()),
  resizeToAvatar: vi.fn(async () => new Blob(['small'], { type: 'image/webp' }))
}));
vi.mock('../../services/botPictureService', () => ({
  botPictureService: {
    previewUrl: vi.fn(() => 'https://auth.test/private-preview'),
    upload: vi.fn(async () => 'https://auth.test/avatar'),
    remove: vi.fn(async () => {})
  }
}));
import { botPictureService } from '../../services/botPictureService';
import { BotAvatarEditor } from './BotAvatarEditor';
it('uploads the resized image for the bot identity, then allows replacing and removing it', async () => {
  const changed = vi.fn();
  const { rerender } = render(<BotAvatarEditor userId="bot-user" name="Helper" onChange={changed} />);
  fireEvent.change(screen.getByLabelText('Choose bot avatar'), {
    target: { files: [new File(['source'], 'avatar.png', { type: 'image/png' })] }
  });
  await waitFor(() => expect(changed).toHaveBeenCalledWith('https://auth.test/avatar'));
  expect(botPictureService.upload).toHaveBeenCalledWith('bot-user', expect.any(Blob));
  rerender(<BotAvatarEditor userId="bot-user" name="Helper" picture="https://auth.test/avatar" onChange={changed} />);
  expect(screen.getByRole('img', { name: 'Helper avatar' })).toHaveAttribute(
    'src',
    'https://auth.test/private-preview'
  );
  expect(screen.getByRole('button', { name: 'Replace bot avatar' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove bot avatar' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(undefined));
  expect(botPictureService.remove).toHaveBeenCalledWith('bot-user');
});
