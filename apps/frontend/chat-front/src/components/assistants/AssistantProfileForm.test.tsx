import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('../../services/assistantService', () => ({
  assistantService: {
    profile: vi.fn(async () => null),
    saveProfile: vi.fn(async (_id: string, input: { handle: string; bio: string; public: boolean }) => ({
      ...input,
      userId: 'bot-user'
    }))
  }
}));
import { assistantService } from '../../services/assistantService';
import { AssistantProfileForm } from './AssistantProfileForm';
it('publishes an arbitrary bot handle and bio through the managed profile endpoint', async () => {
  const saved = vi.fn();
  render(<AssistantProfileForm assistantId="a1" name="Lab helper" onClose={saved} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: /Bot handle/ })).toBeEnabled());
  fireEvent.change(screen.getByRole('textbox', { name: /Bot handle/ }), { target: { value: 'lab-helper' } });
  fireEvent.change(screen.getByLabelText('Public bio'), { target: { value: 'Compares measured results' } });
  fireEvent.click(screen.getByLabelText('Public profile and available to others'));
  fireEvent.click(screen.getByRole('button', { name: 'Save public profile' }));
  expect(await screen.findByText('Profile saved. You can upload or change the avatar below.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload bot avatar' })).toBeEnabled();
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close profile editor' }));
  expect(saved).toHaveBeenCalledOnce();
  expect(assistantService.saveProfile).toHaveBeenCalledWith('a1', {
    handle: 'lab-helper',
    bio: 'Compares measured results',
    public: true
  });
});
